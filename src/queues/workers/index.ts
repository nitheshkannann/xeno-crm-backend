import { campaignDispatchWorker } from './dispatchWorker.js';
import { channelSendWorker } from './channelWorker.js';
import { insightsWorker } from './insightsWorker.js';
import { healthComputeWorker } from './healthWorker.js';
import { healthComputeQueue, QUEUES } from '../queues.js';

export async function initWorkers() {
  // Workers are auto-started on import — just verify they're running
  const workers = [
    campaignDispatchWorker,
    channelSendWorker,
    insightsWorker,
    healthComputeWorker,
  ];

  console.log(`✅ Started ${workers.length} BullMQ workers:`);
  console.log(`   - ${QUEUES.CAMPAIGN_DISPATCH}`);
  console.log(`   - ${QUEUES.CHANNEL_SEND}`);
  console.log(`   - ${QUEUES.INSIGHTS_GENERATE}`);
  console.log(`   - ${QUEUES.HEALTH_COMPUTE}`);

  // Queue initial health score computation on startup
  await healthComputeQueue.add('startup-health-compute', {}, {
    delay: 5000, // Wait 5s for DB to be ready
    jobId: 'startup-health-compute', // Deduplication
  });
}
