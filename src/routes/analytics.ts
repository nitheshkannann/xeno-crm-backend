import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

export const analyticsRouter = new Hono();
analyticsRouter.use('*', authMiddleware);

// GET /analytics/overview
analyticsRouter.get('/overview', async (c) => {
  const [
    customerStats,
    campaignStats,
    recentSnapshots,
  ] = await Promise.all([
    prisma.customer.groupBy({
      by: ['healthLabel'],
      _count: { id: true },
      _sum: { totalSpend: true },
    }),
    prisma.campaign.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
    prisma.analyticsSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: 7,
    }),
  ]);

  const totalCustomers = customerStats.reduce((s, c) => s + c._count.id, 0);
  const activeCustomers = (customerStats.find(c => c.healthLabel === 'ACTIVE')?._count.id || 0)
    + (customerStats.find(c => c.healthLabel === 'HIGHLY_LOYAL')?._count.id || 0);
  const churnRisk = customerStats.find(c => c.healthLabel === 'CHURN_RISK')?._count.id || 0;
  const atRisk = customerStats.find(c => c.healthLabel === 'AT_RISK')?._count.id || 0;
  const totalRevenue = customerStats.reduce((s, c) => s + (c._sum.totalSpend || 0), 0);

  const totalCampaigns = campaignStats.reduce((s, c) => s + c._count.id, 0);
  const activeCampaigns = campaignStats.find(c => c.status === 'RUNNING')?._count.id || 0;

  // Aggregate delivery metrics from snapshots
  const snapshotSum = recentSnapshots.reduce((acc, s) => ({
    messagesSent: acc.messagesSent + s.messagesSent,
    delivered: acc.delivered + s.delivered,
    opened: acc.opened + s.opened,
    clicked: acc.clicked + s.clicked,
    converted: acc.converted + s.converted,
  }), { messagesSent: 0, delivered: 0, opened: 0, clicked: 0, converted: 0 });

  return c.json({
    success: true,
    data: {
      totalCustomers,
      activeCustomers,
      inactiveCustomers: atRisk + churnRisk,
      churnRiskCustomers: churnRisk,
      atRiskCustomers: atRisk,
      totalCampaigns,
      activeCampaigns,
      totalRevenue: Math.round(totalRevenue),
      avgOpenRate: snapshotSum.delivered > 0 ? snapshotSum.opened / snapshotSum.delivered : 0,
      avgClickRate: snapshotSum.opened > 0 ? snapshotSum.clicked / snapshotSum.opened : 0,
      avgConversionRate: snapshotSum.clicked > 0 ? snapshotSum.converted / snapshotSum.clicked : 0,
    },
  });
});

// GET /analytics/trends?days=30
analyticsRouter.get('/trends', async (c) => {
  const days = parseInt(c.req.query('days') || '30');
  const since = new Date();
  since.setDate(since.getDate() - days);

  const snapshots = await prisma.analyticsSnapshot.findMany({
    where: { date: { gte: since } },
    orderBy: { date: 'asc' },
  });

  return c.json({ success: true, data: snapshots });
});

// GET /analytics/campaigns — campaign performance comparison
analyticsRouter.get('/campaigns', async (c) => {
  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ['COMPLETED', 'RUNNING'] } },
    include: {
      segment: { select: { id: true, name: true } },
      insights: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { logs: true } },
    },
    orderBy: { launchedAt: 'desc' },
    take: 20,
  });

  // For each campaign, compute stats
  const campaignsWithStats = await Promise.all(campaigns.map(async (campaign) => {
    const events = await prisma.deliveryEvent.findMany({
      where: { log: { campaignId: campaign.id } },
      select: { eventType: true },
    });

    const eventMap: Record<string, number> = {};
    events.forEach(e => { eventMap[e.eventType] = (eventMap[e.eventType] || 0) + 1; });

    const total = campaign._count.logs;
    const delivered = eventMap['DELIVERED'] || 0;
    const opened = eventMap['OPENED'] || 0;
    const clicked = eventMap['CLICKED'] || 0;
    const converted = eventMap['CONVERTED'] || 0;

    return {
      ...campaign,
      stats: {
        total,
        delivered,
        opened,
        clicked,
        converted,
        openRate: delivered > 0 ? opened / delivered : 0,
        clickRate: opened > 0 ? clicked / opened : 0,
        conversionRate: clicked > 0 ? converted / clicked : 0,
      },
    };
  }));

  return c.json({ success: true, data: campaignsWithStats });
});

// GET /analytics/segments — segment performance
analyticsRouter.get('/segments', async (c) => {
  const memories = await prisma.marketingMemory.findMany({
    include: { campaign: { select: { id: true, name: true, channel: true } } },
    orderBy: { conversionRate: 'desc' },
  });
  return c.json({ success: true, data: memories });
});

// GET /analytics/health-distribution
analyticsRouter.get('/health-distribution', async (c) => {
  const dist = await prisma.customer.groupBy({
    by: ['healthLabel'],
    _count: { id: true },
    _avg: { healthScore: true, totalSpend: true },
  });
  return c.json({ success: true, data: dist });
});
