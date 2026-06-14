import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { SegmentEngine } from '../services/SegmentEngine.js';

export const segmentsRouter = new Hono();
segmentsRouter.use('*', authMiddleware);

const filterRuleSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.object({
    field: z.string(),
    operator: z.string(),
    value: z.union([z.string(), z.number(), z.array(z.string())]),
  }),
  z.object({
    logic: z.enum(['AND', 'OR', 'NOT']),
    rules: z.array(filterRuleSchema),
  }),
]));

const createSegmentSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  filterRules: z.object({
    logic: z.enum(['AND', 'OR', 'NOT']),
    rules: z.array(filterRuleSchema),
  }),
  isAutoScheduled: z.boolean().default(false),
  autoObjective: z.string().optional(),
  preferredChannel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'PUSH']).default('EMAIL'),
});

// GET /segments
segmentsRouter.get('/', async (c) => {
  const segments = await prisma.segment.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return c.json({ success: true, data: segments });
});

// GET /segments/:id
segmentsRouter.get('/:id', async (c) => {
  const segment = await prisma.segment.findUnique({
    where: { id: c.req.param('id') },
    include: {
      campaigns: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, status: true, createdAt: true, channel: true },
      },
    },
  });
  if (!segment) return c.json({ success: false, error: 'Segment not found' }, 404);
  return c.json({ success: true, data: segment });
});

// POST /segments/preview — real-time preview without saving
segmentsRouter.post('/preview', async (c) => {
  const body = await c.req.json();
  const { filterRules } = body;
  if (!filterRules) return c.json({ success: false, error: 'filterRules required' }, 400);
  const preview = await SegmentEngine.preview(filterRules);
  return c.json({ success: true, data: preview });
});

// POST /segments — create segment
segmentsRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createSegmentSchema.safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: 'Invalid input', details: parsed.error.errors }, 400);

  const { filterRules, ...rest } = parsed.data;

  // Compute initial customer count
  const preview = await SegmentEngine.preview(filterRules as never);

  const segment = await prisma.segment.create({
    data: {
      ...rest,
      filterRules: filterRules as never,
      customerCount: preview.count,
      lastComputedAt: new Date(),
    },
  });

  return c.json({ success: true, data: segment }, 201);
});

// POST /segments/:id/compute — recompute customer count
segmentsRouter.post('/:id/compute', async (c) => {
  const segment = await prisma.segment.findUnique({ where: { id: c.req.param('id') } });
  if (!segment) return c.json({ success: false, error: 'Segment not found' }, 404);

  const preview = await SegmentEngine.preview(segment.filterRules as never);
  const updated = await prisma.segment.update({
    where: { id: segment.id },
    data: { customerCount: preview.count, lastComputedAt: new Date() },
  });

  return c.json({ success: true, data: { ...updated, sample: preview.sample } });
});

// PUT /segments/:id
segmentsRouter.put('/:id', async (c) => {
  const body = await c.req.json();
  const parsed = createSegmentSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: 'Invalid input' }, 400);

  const { filterRules, ...rest } = parsed.data;
  let update: Record<string, unknown> = { ...rest };
  if (filterRules) {
    const preview = await SegmentEngine.preview(filterRules as never);
    update = { ...update, filterRules, customerCount: preview.count, lastComputedAt: new Date() };
  }

  const segment = await prisma.segment.update({
    where: { id: c.req.param('id') },
    data: update as never,
  });
  return c.json({ success: true, data: segment });
});

// DELETE /segments/:id
segmentsRouter.delete('/:id', async (c) => {
  await prisma.segment.delete({ where: { id: c.req.param('id') } });
  return c.json({ success: true, data: { deleted: true } });
});
