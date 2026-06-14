import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';

export const trackingRouter = new Hono();

// A 1x1 transparent GIF buffer
const pixelBuffer = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

/**
 * GET /api/tracking/open/:logId
 * Returns a 1x1 tracking pixel and records an OPENED event
 */
trackingRouter.get('/open/:logId', async (c) => {
  const logId = c.req.param('logId');

  try {
    const log = await prisma.campaignLog.findUnique({ where: { id: logId } });
    if (log && log.status !== 'CONVERTED' && log.status !== 'CLICKED' && log.status !== 'OPENED') {
      await prisma.campaignLog.update({ where: { id: logId }, data: { status: 'OPENED' } });
      
      // Attempt to record delivery event for uniqueness
      await prisma.deliveryEvent.create({
        data: {
          logId,
          eventType: 'OPENED',
          idempotencyKey: `${log.idempotencyKey}:real:opened`,
        },
      }).catch(() => { /* Ignore duplicate */ });
    }
  } catch (error) {
    console.error(`[Tracking] Failed to track open for ${logId}:`, error);
  }

  // Return the 1x1 transparent GIF
  c.header('Content-Type', 'image/gif');
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  
  return c.body(pixelBuffer);
});

/**
 * GET /api/tracking/click/:logId
 * Records a CLICKED event and redirects to the target URL
 */
trackingRouter.get('/click/:logId', async (c) => {
  const logId = c.req.param('logId');
  const targetUrl = c.req.query('url') || 'http://localhost:5173'; // Default fallback

  try {
    const log = await prisma.campaignLog.findUnique({ where: { id: logId } });
    if (log && log.status !== 'CONVERTED' && log.status !== 'CLICKED') {
      await prisma.campaignLog.update({ where: { id: logId }, data: { status: 'CLICKED' } });
      
      await prisma.deliveryEvent.create({
        data: {
          logId,
          eventType: 'CLICKED',
          idempotencyKey: `${log.idempotencyKey}:real:clicked`,
        },
      }).catch(() => { /* Ignore duplicate */ });
    }
  } catch (error) {
    console.error(`[Tracking] Failed to track click for ${logId}:`, error);
  }

  return c.redirect(targetUrl);
});
