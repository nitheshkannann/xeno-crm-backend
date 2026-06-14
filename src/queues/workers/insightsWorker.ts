import { Worker } from 'bullmq';
import { redisConnection } from '../../lib/redis.js';
import { generateCampaignInsights } from '../../ai/InsightsEngine.js';
import { QUEUES, type InsightsJob } from '../queues.js';

export const insightsWorker = new Worker<InsightsJob>(
  QUEUES.INSIGHTS_GENERATE,
  async (job) => {
    const { campaignId } = job.data;
    console.log(`[InsightsWorker] Generating insights for campaign ${campaignId}`);
    await generateCampaignInsights({ campaignId });
    console.log(`[InsightsWorker] Insights saved for campaign ${campaignId}`);
  },
  {
    connection: redisConnection,
    concurrency: 2,
  },
);

insightsWorker.on('completed', (job) => {
  console.log(`[InsightsWorker] Job ${job.id} completed`);
});

insightsWorker.on('failed', (job, err) => {
  console.error(`[InsightsWorker] Job ${job?.id} failed:`, err.message);
});
