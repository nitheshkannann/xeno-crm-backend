import { Worker } from 'bullmq';
import { redisConnection } from '../../lib/redis.js';
import { prisma } from '../../lib/prisma.js';
import { callbackProcessQueue, insightsGenerateQueue, QUEUES, type ChannelSendJob, type CallbackJob } from '../queues.js';
import { EmailService } from '../../services/EmailService.js';
import { WhatsAppService } from '../../services/WhatsAppService.js';

/**
 * Channel Worker
 * Sends actual emails using EmailService if configured, or
 * Simulates realistic message delivery for demo "@example.com" users.
 */
export const channelSendWorker = new Worker<ChannelSendJob>(
  QUEUES.CHANNEL_SEND,
  async (job) => {
    const { logId, campaignId, channel, idempotencyKey, customerId, message, subject } = job.data;

    // Fetch the customer to check the email and variant for subject
    const log = await prisma.campaignLog.findUnique({
      where: { id: logId },
      include: { customer: true, variant: true, campaign: true },
    });

    if (!log) {
      console.log(`[ChannelWorker] CampaignLog ${logId} not found (likely deleted due to cancellation). Skipping.`);
      return { status: 'cancelled', reason: 'log_deleted' };
    }

    if (log.campaign.status === 'CANCELLED') {
      console.log(`[ChannelWorker] Campaign ${campaignId} is cancelled. Skipping send.`);
      return { status: 'cancelled', reason: 'campaign_cancelled' };
    }

    const customer = log.customer;
    const variant = log.variant;

    // Simulate network delay (varies by channel)
    const delay = channel === 'SMS' ? random(200, 800)
      : channel === 'WHATSAPP' ? random(300, 1200)
      : channel === 'PUSH' ? random(100, 500)
      : random(500, 2000); // EMAIL

    await sleep(delay);

    // Mark as SENT
    await prisma.campaignLog.update({
      where: { id: logId },
      data: { status: 'SENT' },
    });

    await createEvent(logId, 'SENT', `${idempotencyKey}:sent`);

    // --- REAL EMAIL LOGIC ---
    if (channel === 'EMAIL' && customer.email && !customer.email.endsWith('@example.com')) {
      // It's a real email address, so try to actually send it!
      const emailSubject = subject || variant?.subject || 'Special Offer from XENO';
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      
      // Inject tracking pixel at the end of the email
      const trackingPixel = `<img src="${baseUrl}/api/tracking/open/${logId}" width="1" height="1" alt="" />`;
      
      // Format as HTML
      const htmlContent = `
        <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
          ${message.replace(/\n/g, '<br/>')}
          <br/><br/>
          <a href="${baseUrl}/api/tracking/click/${logId}?url=${encodeURIComponent(baseUrl)}">Click here to shop now</a>
          ${trackingPixel}
        </div>
      `;

      try {
        const sent = await EmailService.sendEmail(customer.email, emailSubject, htmlContent);
        if (sent) {
          await prisma.campaignLog.update({ where: { id: logId }, data: { status: 'DELIVERED' } });
          await createEvent(logId, 'DELIVERED', `${idempotencyKey}:delivered`);
          
          // DO NOT run simulated engagement. The user has to actually open/click the real email.
          void checkCampaignCompletion(campaignId);
          return { status: 'delivered', type: 'real' };
        }
      } catch (err) {
        await prisma.campaignLog.update({ where: { id: logId }, data: { status: 'FAILED', errorMessage: 'SMTP Delivery failed' } });
        await createEvent(logId, 'FAILED', `${idempotencyKey}:failed`);
        void checkCampaignCompletion(campaignId);
        return { status: 'failed', type: 'real' };
      }
    }

    // --- REAL WHATSAPP LOGIC ---
    if (channel === 'WHATSAPP' && customer.phone && !customer.email.endsWith('@example.com')) {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const trackedMessage = `${message}\n\nClick here to view offer: ${baseUrl}/api/tracking/click/${logId}?url=${encodeURIComponent(baseUrl)}`;
      
      try {
        const sent = await WhatsAppService.sendMessage(customer.phone, trackedMessage);
        if (sent) {
          await prisma.campaignLog.update({ where: { id: logId }, data: { status: 'DELIVERED' } });
          await createEvent(logId, 'DELIVERED', `${idempotencyKey}:delivered`);
          
          void checkCampaignCompletion(campaignId);
          return { status: 'delivered', type: 'real' };
        }
      } catch (err) {
        await prisma.campaignLog.update({ where: { id: logId }, data: { status: 'FAILED', errorMessage: 'WhatsApp Delivery failed' } });
        await createEvent(logId, 'FAILED', `${idempotencyKey}:failed`);
        void checkCampaignCompletion(campaignId);
        return { status: 'failed', type: 'real' };
      }
    }


    // --- SIMULATION LOGIC FOR DEMO ACCOUNTS ---
    const deliveryRoll = Math.random();
    if (deliveryRoll > 0.92) {
      // FAILED
      await prisma.campaignLog.update({ where: { id: logId }, data: { status: 'FAILED', errorMessage: 'Delivery failed: carrier rejected' } });
      await createEvent(logId, 'FAILED', `${idempotencyKey}:failed`);
      void checkCampaignCompletion(campaignId);
      return { status: 'failed', type: 'simulated' };
    }

    await sleep(random(500, 3000));
    await prisma.campaignLog.update({ where: { id: logId }, data: { status: 'DELIVERED' } });
    await createEvent(logId, 'DELIVERED', `${idempotencyKey}:delivered`);

    // Simulate engagement (async callbacks with realistic delays)
    simulateEngagementAsync(logId, idempotencyKey, channel, campaignId, customer.id);

    return { status: 'delivered', type: 'simulated' };
  },
  {
    connection: redisConnection,
    concurrency: 5,
  },
);

async function simulateEngagementAsync(
  logId: string,
  idempotencyKey: string,
  channel: string,
  campaignId: string,
  customerId: string,
) {
  // Opens (45% of delivered)
  if (Math.random() < 0.45) {
    await sleep(random(2000, 30000)); // Open within 30 seconds of delivery (accelerated for demo)
    await createEvent(logId, 'OPENED', `${idempotencyKey}:opened`);
    await prisma.campaignLog.update({ where: { id: logId }, data: { status: 'OPENED' } });

    // Read (80% of opens)
    if (Math.random() < 0.80) {
      await sleep(random(1000, 10000));
      await createEvent(logId, 'READ', `${idempotencyKey}:read`);
      await prisma.campaignLog.update({ where: { id: logId }, data: { status: 'READ' } });
    }

    // Click (25% of opens)
    if (Math.random() < 0.25) {
      await sleep(random(2000, 15000));
      await createEvent(logId, 'CLICKED', `${idempotencyKey}:clicked`);
      await prisma.campaignLog.update({ where: { id: logId }, data: { status: 'CLICKED' } });

      // Convert (15% of clicks)
      if (Math.random() < 0.15) {
        await sleep(random(5000, 60000));
        await createEvent(logId, 'CONVERTED', `${idempotencyKey}:converted`);
        await prisma.campaignLog.update({ where: { id: logId }, data: { status: 'CONVERTED' } });
        
        // --- CREATE ACTUAL ORDER TO REFLECT IN PROFILE ---
        try {
          await prisma.$transaction(async (tx) => {
            const amount = random(1000, 5000);
            
            await tx.order.create({
              data: {
                customerId,
                campaignId,
                amount,
                status: 'DELIVERED',
                items: [{ name: 'Campaign Offer', category: 'Offer', price: amount, qty: 1 }],
              },
            });

            const customer = await tx.customer.findUnique({ where: { id: customerId } });
            if (customer) {
              const newTotalSpend = customer.totalSpend + amount;
              const newOrderCount = customer.orderCount + 1;
              const newAvgOrderValue = newTotalSpend / newOrderCount;
              const newHealthScore = Math.min(100, customer.healthScore + 20);
              let newHealthLabel = customer.healthLabel;
              if (newHealthScore >= 80) newHealthLabel = 'HIGHLY_LOYAL';
              else if (newHealthScore >= 50) newHealthLabel = 'ACTIVE';

              await tx.customer.update({
                where: { id: customerId },
                data: {
                  totalSpend: newTotalSpend,
                  orderCount: newOrderCount,
                  avgOrderValue: newAvgOrderValue,
                  lastOrderDate: new Date(),
                  daysSinceLastOrder: 0,
                  healthScore: newHealthScore,
                  healthLabel: newHealthLabel as never,
                },
              });
            }
          });
        } catch (e) {
          console.error('[ChannelWorker] Failed to create simulated order:', e);
        }
      }
    }
  }

  // Check if campaign is done after engagement simulation
  void checkCampaignCompletion(campaignId);
}

async function createEvent(logId: string, eventType: string, idempotencyKey: string) {
  try {
    await prisma.deliveryEvent.create({
      data: { logId, eventType: eventType as never, idempotencyKey },
    });
  } catch {
    // Idempotency: ignore duplicate events
  }
}

async function checkCampaignCompletion(campaignId: string) {
  const [total, pending] = await Promise.all([
    prisma.campaignLog.count({ where: { campaignId } }),
    prisma.campaignLog.count({ where: { campaignId, status: { in: ['QUEUED', 'SENT'] } } }),
  ]);

  if (total > 0 && pending === 0) {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (campaign?.status === 'RUNNING') {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      // Queue AI insights generation
      await insightsGenerateQueue.add('generate', { campaignId }, { delay: 2000 });
      console.log(`[ChannelWorker] Campaign ${campaignId} completed → insights queued`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

channelSendWorker.on('failed', (job, err) => {
  console.error(`[ChannelWorker] Job ${job?.id} failed:`, err.message);
});
