import { Worker } from 'bullmq';
import { redisConnection } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { channelSendQueue, QUEUES, type CampaignDispatchJob, type ChannelSendJob } from '../queues.js';

/**
 * Campaign Dispatch Worker
 * Fans out campaign → per-customer channel send jobs
 * Assigns message variant based on customer profile
 */
export const campaignDispatchWorker = new Worker<CampaignDispatchJob>(
  QUEUES.CAMPAIGN_DISPATCH,
  async (job) => {
    const { campaignId, customerIds, channel, variantIds } = job.data;
    console.log(`[DispatchWorker] Campaign ${campaignId}: dispatching to ${customerIds.length} customers`);

    // Load variants
    const variants = await prisma.campaignVariant.findMany({
      where: { id: { in: variantIds } },
    });

    if (variants.length === 0) {
      throw new Error(`No variants found for campaign ${campaignId}`);
    }

    // Load customers with their profiles for variant assignment
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        totalSpend: true,
        avgOrderValue: true,
        lastOrderDate: true,
        preferredCategory: true,
        healthLabel: true,
        city: true,
        orderCount: true,
      },
    });

    // Create CampaignLog records and queue channel send jobs
    const channelJobs: Parameters<typeof channelSendQueue.addBulk>[0] = [];

    for (const customer of customers) {
      // Assign variant based on profile
      const variant = assignVariant(variants, customer);
      const idempotencyKey = `${campaignId}:${customer.id}:${channel}`;

      // Create log record
      let log;
      try {
        log = await prisma.campaignLog.create({
          data: {
            campaignId,
            customerId: customer.id,
            variantId: variant?.id,
            channel: channel as never,
            status: 'QUEUED',
            idempotencyKey,
          },
        });
      } catch (err: unknown) {
        // Skip duplicate (idempotency)
        if ((err as { code?: string }).code === 'P2002') continue;
        throw err;
      }

      // Interpolate message and subject with customer data
      const message = variant ? interpolateTemplate(variant.body, customer) : 'Special offer just for you!';
      const subject = variant?.subject ? interpolateTemplate(variant.subject, customer) : undefined;

      channelJobs.push({
        name: `send:${log.id}`,
        data: {
          logId: log.id,
          customerId: customer.id,
          campaignId,
          channel,
          variantId: variant?.id,
          message,
          subject,
          idempotencyKey,
        } as ChannelSendJob,
      });
    }

    // Bulk queue all send jobs
    if (channelJobs.length > 0) {
      await channelSendQueue.addBulk(channelJobs);
    }

    // Update campaign status to RUNNING
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'RUNNING', launchedAt: new Date() },
    });

    console.log(`[DispatchWorker] Campaign ${campaignId}: queued ${channelJobs.length} send jobs`);
    return { dispatched: channelJobs.length };
  },
  {
    connection: redisConnection,
    concurrency: 2,
  },
);

function assignVariant(
  variants: { id: string; label: string; targetProfile?: string | null; body: string; subject?: string | null }[],
  customer: { totalSpend: number; healthLabel: string },
): (typeof variants)[0] | null {
  if (variants.length === 0) return null;

  // Simple profile-based assignment
  const profile = customer.totalSpend > 20000 ? 'high_spender'
    : customer.healthLabel === 'HIGHLY_LOYAL' ? 'high_spender'
    : customer.healthLabel === 'AT_RISK' ? 'price_sensitive'
    : customer.healthLabel === 'CHURN_RISK' ? 'price_sensitive'
    : 'explorer';

  const matched = variants.find(v => v.targetProfile === profile);
  return matched || variants[Math.floor(Math.random() * variants.length)];
}

function interpolateTemplate(
  template: string,
  customer: {
    firstName: string;
    lastName: string;
    totalSpend: number;
    avgOrderValue: number;
    lastOrderDate: Date | null;
    preferredCategory: string | null;
    city: string | null;
    orderCount: number;
  },
): string {
  const lastOrderDate = customer.lastOrderDate
    ? new Date(customer.lastOrderDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'a while ago';

  return template
    .replace(/\{\{first_name\}\}/g, customer.firstName)
    .replace(/\{\{last_name\}\}/g, customer.lastName)
    .replace(/\{\{last_order_date\}\}/g, lastOrderDate)
    .replace(/\{\{total_spend\}\}/g, `₹${customer.totalSpend.toLocaleString('en-IN')}`)
    .replace(/\{\{avg_order_value\}\}/g, `₹${customer.avgOrderValue.toLocaleString('en-IN')}`)
    .replace(/\{\{preferred_category\}\}/g, customer.preferredCategory || 'our latest collection')
    .replace(/\{\{city\}\}/g, customer.city || 'your city')
    .replace(/\{\{order_count\}\}/g, customer.orderCount.toString());
}

campaignDispatchWorker.on('completed', (job) => {
  console.log(`[DispatchWorker] Job ${job.id} completed`);
});

campaignDispatchWorker.on('failed', (job, err) => {
  console.error(`[DispatchWorker] Job ${job?.id} failed:`, err.message);
});
