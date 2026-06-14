import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { campaignDispatchQueue } from '../queues/queues.js';
import { SegmentEngine } from '../services/SegmentEngine.js';

export const campaignsRouter = new Hono();
campaignsRouter.use('*', authMiddleware);

const createCampaignSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().optional(),
  segmentId: z.string(),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'PUSH']),
  variants: z.array(z.object({
    label: z.string(),
    angle: z.string(),
    subject: z.string().optional(),
    body: z.string(),
    targetProfile: z.string().optional(),
  })).min(1),
  scheduledAt: z.string().datetime().optional(),
});

// GET /campaigns
campaignsRouter.get('/', async (c) => {
  const campaigns = await prisma.campaign.findMany({
    include: {
      segment: { select: { id: true, name: true, customerCount: true } },
      variants: true,
      _count: { select: { logs: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return c.json({ success: true, data: campaigns });
});

// GET /campaigns/:id
campaignsRouter.get('/:id', async (c) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: c.req.param('id') },
    include: {
      segment: true,
      variants: true,
      insights: { orderBy: { createdAt: 'desc' }, take: 1 },
      logs: {
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          variant: { select: { label: true } },
          events: { orderBy: { occurredAt: 'asc' } },
        },
      },
    },
  });
  if (!campaign) return c.json({ success: false, error: 'Campaign not found' }, 404);

  // Compute stats
  const stats = await getCampaignStats(campaign.id);
  return c.json({ success: true, data: { ...campaign, stats } });
});

// GET /campaigns/:id/stats
campaignsRouter.get('/:id/stats', async (c) => {
  const stats = await getCampaignStats(c.req.param('id'));
  return c.json({ success: true, data: stats });
});

// GET /campaigns/:id/orders
campaignsRouter.get('/:id/orders', async (c) => {
  const campaignId = c.req.param('id');
  const orders = await prisma.order.findMany({
    where: { campaignId },
    include: {
      customer: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return c.json({ success: true, data: orders });
});

// POST /campaigns — create campaign (DRAFT)
campaignsRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: 'Invalid input', details: parsed.error.errors }, 400);

  const { variants, segmentId, channel, name, description, scheduledAt } = parsed.data;

  const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
  if (!segment) return c.json({ success: false, error: 'Segment not found' }, 404);

  const campaign = await prisma.campaign.create({
    data: {
      name,
      description,
      segmentId,
      channel: channel as never,
      status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      variants: { create: variants.map(v => ({ label: v.label, angle: v.angle, subject: v.subject, body: v.body, targetProfile: v.targetProfile })) },
    },
    include: { variants: true, segment: true },
  });

  return c.json({ success: true, data: campaign }, 201);
});

// POST /campaigns/:id/launch — launch campaign
campaignsRouter.post('/:id/launch', async (c) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: c.req.param('id') },
    include: { variants: true, segment: true },
  });
  if (!campaign) return c.json({ success: false, error: 'Campaign not found' }, 404);
  if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) {
    return c.json({ success: false, error: `Cannot launch campaign in ${campaign.status} status` }, 400);
  }

  // Compute segment
  const customers = await SegmentEngine.compute(campaign.segment.filterRules as never);
  if (customers.length === 0) {
    return c.json({ success: false, error: 'Segment has 0 customers' }, 400);
  }

  // Update campaign status
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'RUNNING', launchedAt: new Date() },
  });

  // Queue dispatch
  await campaignDispatchQueue.add(`dispatch:${campaign.id}`, {
    campaignId: campaign.id,
    customerIds: customers.map(c => c.id),
    channel: campaign.channel,
    variantIds: campaign.variants.map(v => v.id),
  });

  return c.json({ success: true, data: { message: `Campaign launched for ${customers.length} customers`, audienceSize: customers.length } });
});

// POST /campaigns/:id/cancel
campaignsRouter.post('/:id/cancel', async (c) => {
  const campaign = await prisma.campaign.update({
    where: { id: c.req.param('id') },
    data: { status: 'CANCELLED' },
  });
  return c.json({ success: true, data: campaign });
});

async function getCampaignStats(campaignId: string) {
  const [total, statusCounts, events] = await Promise.all([
    prisma.campaignLog.count({ where: { campaignId } }),
    prisma.campaignLog.groupBy({ by: ['status'], where: { campaignId }, _count: { id: true } }),
    prisma.deliveryEvent.findMany({
      where: { log: { campaignId } },
      select: { eventType: true },
    }),
  ]);

  const statusMap: Record<string, number> = {};
  statusCounts.forEach(s => { statusMap[s.status] = s._count.id; });

  const eventMap: Record<string, number> = {};
  events.forEach(e => { eventMap[e.eventType] = (eventMap[e.eventType] || 0) + 1; });

  const delivered = eventMap['DELIVERED'] || 0;
  const opened = eventMap['OPENED'] || 0;
  const clicked = eventMap['CLICKED'] || 0;
  const converted = eventMap['CONVERTED'] || 0;

  return {
    total,
    queued: statusMap['QUEUED'] || 0,
    sent: statusMap['SENT'] || 0,
    delivered,
    failed: eventMap['FAILED'] || 0,
    opened,
    clicked,
    converted,
    deliveryRate: total > 0 ? delivered / total : 0,
    openRate: delivered > 0 ? opened / delivered : 0,
    clickRate: opened > 0 ? clicked / opened : 0,
    conversionRate: clicked > 0 ? converted / clicked : 0,
  };
}
