import { Worker } from 'bullmq';
import { redisConnection } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { QUEUES, type HealthComputeJob } from '../queues.js';

type HealthLabel = 'HIGHLY_LOYAL' | 'ACTIVE' | 'AT_RISK' | 'CHURN_RISK';

function computeHealthScore(params: {
  daysSinceLastOrder: number | null;
  orderCount: number;
  totalSpend: number;
  emailOpenRate: number;
  emailClickRate: number;
}): { score: number; label: HealthLabel } {
  const { daysSinceLastOrder, orderCount, totalSpend, emailOpenRate, emailClickRate } = params;

  let recency = 0;
  if (daysSinceLastOrder !== null) {
    if (daysSinceLastOrder <= 15) recency = 25;
    else if (daysSinceLastOrder <= 30) recency = 20;
    else if (daysSinceLastOrder <= 60) recency = 15;
    else if (daysSinceLastOrder <= 90) recency = 10;
    else if (daysSinceLastOrder <= 180) recency = 5;
  }

  let frequency = 0;
  if (orderCount >= 20) frequency = 25;
  else if (orderCount >= 10) frequency = 20;
  else if (orderCount >= 5) frequency = 15;
  else if (orderCount >= 3) frequency = 10;
  else if (orderCount >= 1) frequency = 5;

  let monetary = 0;
  if (totalSpend >= 50000) monetary = 25;
  else if (totalSpend >= 20000) monetary = 20;
  else if (totalSpend >= 10000) monetary = 15;
  else if (totalSpend >= 5000) monetary = 10;
  else if (totalSpend >= 1000) monetary = 5;

  const engagementAvg = (emailOpenRate + emailClickRate) / 2;
  let engagement = 0;
  if (engagementAvg >= 0.6) engagement = 25;
  else if (engagementAvg >= 0.4) engagement = 20;
  else if (engagementAvg >= 0.25) engagement = 15;
  else if (engagementAvg >= 0.1) engagement = 10;
  else engagement = 5;

  const score = recency + frequency + monetary + engagement;
  const label: HealthLabel =
    score >= 80 ? 'HIGHLY_LOYAL'
    : score >= 60 ? 'ACTIVE'
    : score >= 40 ? 'AT_RISK'
    : 'CHURN_RISK';

  return { score, label };
}

/**
 * Health Score Worker
 * Recomputes Customer 360 health scores nightly.
 * Also updates daysSinceLastOrder (which drifts daily).
 */
export const healthComputeWorker = new Worker<HealthComputeJob>(
  QUEUES.HEALTH_COMPUTE,
  async (job) => {
    const { customerIds } = job.data;
    const where = customerIds?.length ? { id: { in: customerIds } } : {};

    const customers = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        lastOrderDate: true,
        orderCount: true,
        totalSpend: true,
        emailOpenRate: true,
        emailClickRate: true,
      },
    });

    console.log(`[HealthWorker] Recomputing ${customers.length} customer health scores`);
    let updated = 0;

    for (const customer of customers) {
      const daysSinceLastOrder = customer.lastOrderDate
        ? Math.floor((Date.now() - customer.lastOrderDate.getTime()) / 86400000)
        : null;

      const { score, label } = computeHealthScore({
        daysSinceLastOrder,
        orderCount: customer.orderCount,
        totalSpend: customer.totalSpend,
        emailOpenRate: customer.emailOpenRate,
        emailClickRate: customer.emailClickRate,
      });

      await prisma.customer.update({
        where: { id: customer.id },
        data: { healthScore: score, healthLabel: label, daysSinceLastOrder },
      });
      updated++;
    }

    console.log(`[HealthWorker] Updated ${updated} health scores`);
    return { updated };
  },
  {
    connection: redisConnection,
    concurrency: 3,
  },
);

healthComputeWorker.on('completed', (job) => {
  console.log(`[HealthWorker] Job ${job.id} completed`);
});

healthComputeWorker.on('failed', (job, err) => {
  console.error(`[HealthWorker] Job ${job?.id} failed:`, err.message);
});
