import { Queue } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';

// Queue names (no colons allowed in BullMQ v5+)
export const QUEUES = {
  CAMPAIGN_DISPATCH: 'campaign_dispatch',
  CHANNEL_SEND: 'channel_send',
  CALLBACK_PROCESS: 'callback_process',
  INSIGHTS_GENERATE: 'insights_generate',
  HEALTH_COMPUTE: 'health_compute',
} as const;

// Queue definitions
export const campaignDispatchQueue = new Queue<CampaignDispatchJob>(QUEUES.CAMPAIGN_DISPATCH, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export const channelSendQueue = new Queue<ChannelSendJob>(QUEUES.CHANNEL_SEND, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 100 },
  },
});

export const callbackProcessQueue = new Queue(QUEUES.CALLBACK_PROCESS, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 500 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 200 },
  },
});

export const insightsGenerateQueue = new Queue(QUEUES.INSIGHTS_GENERATE, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 20 },
  },
});

export const healthComputeQueue = new Queue(QUEUES.HEALTH_COMPUTE, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 10000 },
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 5 },
  },
});

// Job type definitions
export interface CampaignDispatchJob {
  campaignId: string;
  customerIds: string[];
  channel: string;
  variantIds: string[];
}

export interface ChannelSendJob {
  logId: string;
  customerId: string;
  campaignId: string;
  channel: string;
  variantId?: string;
  message: string;
  subject?: string;
  idempotencyKey: string;
}

export interface CallbackJob {
  logId: string;
  eventType: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface InsightsJob {
  campaignId: string;
}

export interface HealthComputeJob {
  customerIds?: string[]; // If empty, compute all
}
