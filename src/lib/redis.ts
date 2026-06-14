import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Generic redis for basic cache/API operations
export const redis = new Redis(redisUrl);
redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err: any) => console.error('❌ Redis error:', err));

// Factory function for BullMQ workers & queues
// BullMQ requires independent connections to prevent blocking/deadlocks.
// Creating a new Redis instance from the URL string relies on ioredis' built-in parser
// which perfectly handles Upstash username/password/TLS automatically.
export const createRedisConnection = () => {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    family: 0,
  }) as any; // Cast to any to bypass strict BullMQ IORedis version mismatch
};
