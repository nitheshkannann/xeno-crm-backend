import { Hono } from 'hono';
import { streamSSE, streamText } from 'hono/streaming';
import { authMiddleware } from '../middleware/auth.js';
import { buildSegmentFromNL, getMemoryContext } from '../ai/SegmentBuilder.js';
import { generateCampaignVariants } from '../ai/CampaignWriter.js';
import { runCampaignAgent } from '../ai/CampaignAgent.js';
import { chatWithRag } from '../ai/RagEngine.js';
import { prisma } from '../lib/prisma.js';
import { SegmentEngine } from '../services/SegmentEngine.js';
import { campaignDispatchQueue } from '../queues/queues.js';
import type { AIAgentStep } from '@xeno/types';

export const aiRouter = new Hono();
aiRouter.use('*', authMiddleware);

// POST /ai/chat — RAG Chat Endpoint
aiRouter.post('/chat', async (c) => {
  const { query, history } = await c.req.json();
  if (!query) return c.json({ success: false, error: 'query required' }, 400);

  return streamText(c, async (stream) => {
    try {
      const ragStream = await chatWithRag(query, history);
      for await (const chunk of ragStream) {
        await stream.write(chunk.text());
      }
    } catch (err: any) {
      console.error('[RAG Chat Error]', err);
      await stream.write('\\n[Error: Unable to generate response. Please try again later.]');
    }
  });
});

// POST /ai/build-segment — natural language → filter rules
aiRouter.post('/build-segment', async (c) => {
  const { prompt } = await c.req.json();
  if (!prompt) return c.json({ success: false, error: 'prompt required' }, 400);

  try {
    const memoryContext = await getMemoryContext();
    const result = await buildSegmentFromNL(prompt, memoryContext);

    // Get preview count
    const preview = await SegmentEngine.preview(result.filterRules);

    return c.json({
      success: true,
      data: {
        ...result,
        previewCount: preview.count,
        sample: preview.sample,
      },
    });
  } catch (error: any) {
    console.error('Error building segment:', error);
    if (error.message?.includes('429 Too Many Requests') || error.status === 429) {
      return c.json({ success: false, error: 'AI rate limit exceeded. Please wait a moment and try again.' }, 429);
    }
    return c.json({ success: false, error: 'Failed to build segment. Please check AI service availability.' }, 500);
  }
});

// POST /ai/write-campaign — generate message variants
aiRouter.post('/write-campaign', async (c) => {
  const body = await c.req.json();
  const { objective, channel, segmentId } = body;
  if (!objective || !channel) return c.json({ success: false, error: 'objective and channel required' }, 400);

  try {
    let segmentDescription = 'General audience';
    let segmentSize = 0;

    if (segmentId) {
      const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
      if (segment) {
        segmentDescription = segment.description || segment.name;
        segmentSize = segment.customerCount;
      }
    }

    const result = await generateCampaignVariants({ objective, channel, segmentDescription, segmentSize });
    return c.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error writing campaign:', error);
    if (error.message?.includes('429 Too Many Requests') || error.status === 429) {
      return c.json({ success: false, error: 'AI rate limit exceeded. Please wait a moment and try again.' }, 429);
    }
    return c.json({ success: false, error: 'Failed to write campaign variants. Please check AI service availability.' }, 500);
  }
});

// GET /ai/run-agent — SSE streaming multi-step agent
aiRouter.get('/run-agent', authMiddleware, async (c) => {
  const goal = c.req.query('goal');
  if (!goal) return c.json({ success: false, error: 'goal query param required' }, 400);

  return streamSSE(c, async (stream) => {
    const steps: AIAgentStep[] = [];

    try {
      const result = await runCampaignAgent({
        goal,
        onStep: async (step) => {
          steps.push(step);
          await stream.writeSSE({
            data: JSON.stringify({ type: 'step', step }),
            event: 'step',
          });
        },
      });

      await stream.writeSSE({
        data: JSON.stringify({ type: 'complete', result }),
        event: 'complete',
      });
    } catch (err) {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', message: (err as Error).message }),
        event: 'error',
      });
    }
  });
});

// POST /ai/approve-agent — approve agent draft and create real segment + campaign
aiRouter.post('/approve-agent', async (c) => {
  const body = await c.req.json();
  const { segmentName, segmentDescription, filterRules, campaignName, channel, variants } = body;

  // Create segment
  const preview = await SegmentEngine.preview(filterRules);
  const segment = await prisma.segment.create({
    data: {
      name: segmentName,
      description: segmentDescription,
      filterRules,
      customerCount: preview.count,
      lastComputedAt: new Date(),
      preferredChannel: channel,
    },
  });

  // Create campaign with variants
  const campaign = await prisma.campaign.create({
    data: {
      name: campaignName,
      description: segmentDescription,
      segmentId: segment.id,
      channel,
      status: 'RUNNING',
      isAutoGenerated: true,
      launchedAt: new Date(),
      variants: {
        create: variants.map((v: { label: string; angle: string; subject?: string; body: string; targetProfile?: string }) => ({
          label: v.label,
          angle: v.angle,
          subject: v.subject,
          body: v.body,
          targetProfile: v.targetProfile,
        })),
      },
    },
    include: { variants: true },
  });

  // Compute segment customers and launch
  const customers = await SegmentEngine.compute(filterRules);
  await campaignDispatchQueue.add(`dispatch:${campaign.id}`, {
    campaignId: campaign.id,
    customerIds: customers.map((cust: { id: string }) => cust.id),
    channel,
    variantIds: campaign.variants.map((v: { id: string }) => v.id),
  });

  return c.json({
    success: true,
    data: { segment, campaign, audienceSize: customers.length },
  }, 201);
});

// GET /ai/insights/:campaignId
aiRouter.get('/insights/:campaignId', async (c) => {
  const insight = await prisma.aIInsight.findFirst({
    where: { campaignId: c.req.param('campaignId') },
    orderBy: { createdAt: 'desc' },
  });
  if (!insight) return c.json({ success: false, error: 'No insights yet' }, 404);
  return c.json({ success: true, data: insight });
});

// GET /ai/memory — marketing memory context
aiRouter.get('/memory', async (c) => {
  const memories = await prisma.marketingMemory.findMany({
    orderBy: { conversionRate: 'desc' },
    take: 10,
  });
  return c.json({ success: true, data: memories });
});
