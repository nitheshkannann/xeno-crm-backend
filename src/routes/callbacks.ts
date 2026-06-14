import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';

export const callbacksRouter = new Hono();

// POST /callbacks/delivery — called by channel simulator
// This is an internal endpoint, no auth needed (channel service is internal)
callbacksRouter.post('/delivery', async (c) => {
  const body = await c.req.json();
  const { logId, eventType, idempotencyKey, metadata } = body;

  if (!logId || !eventType || !idempotencyKey) {
    return c.json({ success: false, error: 'logId, eventType, and idempotencyKey required' }, 400);
  }

  try {
    // Idempotent: create event only if not already processed
    await prisma.deliveryEvent.create({
      data: { logId, eventType, idempotencyKey, metadata: metadata || {} },
    });

    // Update log status to latest event type
    const statusMap: Record<string, string> = {
      SENT: 'SENT',
      DELIVERED: 'DELIVERED',
      FAILED: 'FAILED',
      OPENED: 'OPENED',
      READ: 'READ',
      CLICKED: 'CLICKED',
      CONVERTED: 'CONVERTED',
    };

    if (statusMap[eventType]) {
      await prisma.campaignLog.update({
        where: { id: logId },
        data: { status: statusMap[eventType] as never },
      });
    }

    return c.json({ success: true, data: { processed: true } });
  } catch (err: unknown) {
    // P2002 = unique constraint violation = duplicate idempotency key → already processed
    if ((err as { code?: string }).code === 'P2002') {
      return c.json({ success: true, data: { processed: false, reason: 'duplicate' } });
    }
    throw err;
  }
});
