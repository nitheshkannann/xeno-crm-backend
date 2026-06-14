import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Required for BullMQ
  family: 0, // Fixes Upstash ECONNRESET on Node 20+
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err: any) => console.error('❌ Redis error:', err));

const parsedUrl = new URL(redisUrl);

export const redisConnection: any = {
  host: parsedUrl.hostname,
  port: parseInt(parsedUrl.port || '6379'),
  username: parsedUrl.username || 'default',
  password: parsedUrl.password || undefined,
  tls: parsedUrl.protocol === 'rediss:' ? { rejectUnauthorized: false } : undefined,
  maxRetriesPerRequest: null
};
