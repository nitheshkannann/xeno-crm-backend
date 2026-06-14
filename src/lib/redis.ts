import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Required for BullMQ
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err));

export const redisConnection = {
  host: new URL(redisUrl).hostname,
  port: parseInt(new URL(redisUrl).port || '6379'),
};
