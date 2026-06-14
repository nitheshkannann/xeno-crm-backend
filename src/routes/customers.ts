import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

export const customersRouter = new Hono();
customersRouter.use('*', authMiddleware);

// GET /customers — paginated, filterable
customersRouter.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');
  const search = c.req.query('search') || '';
  const healthLabel = c.req.query('healthLabel') || '';
  const city = c.req.query('city') || '';
  const sortBy = c.req.query('sortBy') || 'createdAt';
  const sortDir = (c.req.query('sortDir') || 'desc') as 'asc' | 'desc';

  const where = {
    AND: [
      search ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {},
      healthLabel ? { healthLabel: healthLabel as never } : {},
      city ? { city: { contains: city, mode: 'insensitive' as const } } : {},
      { email: { not: { startsWith: 'cart_test_' } } },
    ],
  };

  const validSortFields = ['createdAt', 'totalSpend', 'orderCount', 'healthScore', 'lastOrderDate', 'daysSinceLastOrder'];
  const orderBy = validSortFields.includes(sortBy)
    ? { [sortBy]: sortDir }
    : { createdAt: sortDir };

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return c.json({
    success: true,
    data: customers,
    pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
});

// GET /customers/:id — full 360 profile
customersRouter.get('/:id', async (c) => {
  const customer = await prisma.customer.findUnique({
    where: { id: c.req.param('id') },
    include: {
      orders: { orderBy: { createdAt: 'desc' }, take: 20 },
      segmentMemberships: {
        include: { segment: { select: { id: true, name: true } } },
      },
      campaignLogs: {
        include: {
          campaign: { select: { id: true, name: true, channel: true } },
          events: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });
  if (!customer) return c.json({ success: false, error: 'Customer not found' }, 404);
  return c.json({ success: true, data: customer });
});

// GET /customers/stats/overview
customersRouter.get('/stats/overview', async (c) => {
  const [total, byLabel, avgSpend] = await Promise.all([
    prisma.customer.count({ where: { email: { not: { startsWith: 'cart_test_' } } } }),
    prisma.customer.groupBy({
      by: ['healthLabel'],
      where: { email: { not: { startsWith: 'cart_test_' } } },
      _count: { id: true },
      _avg: { totalSpend: true, healthScore: true },
    }),
    prisma.customer.aggregate({
      where: { email: { not: { startsWith: 'cart_test_' } } },
      _avg: { totalSpend: true, orderCount: true },
      _sum: { totalSpend: true },
    }),
  ]);

  return c.json({
    success: true,
    data: {
      total,
      byHealthLabel: byLabel.map(b => ({
        label: b.healthLabel,
        count: b._count.id,
        avgSpend: Math.round(b._avg.totalSpend || 0),
        avgHealthScore: Math.round(b._avg.healthScore || 0),
      })),
      avgTotalSpend: Math.round(avgSpend._avg.totalSpend || 0),
      avgOrderCount: Math.round(avgSpend._avg.orderCount || 0),
      totalRevenue: Math.round(avgSpend._sum.totalSpend || 0),
    },
  });
});

// POST /customers — create new customer
customersRouter.post('/', async (c) => {
  const body = await c.req.json();
  try {
    const customer = await prisma.customer.create({
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        city: body.city,
        state: body.state,
        gender: body.gender || 'OTHER',
        preferredCategory: body.preferredCategory,
        // Defaults for new customers
        healthScore: 50,
        healthLabel: 'ACTIVE',
        totalSpend: 0,
        orderCount: 0,
        emailOpenRate: 0,
        emailClickRate: 0,
        tags: ['new_user'],
      },
    });
    return c.json({ success: true, data: customer }, 201);
  } catch (error) {
    return c.json({ success: false, error: 'Failed to create customer' }, 400);
  }
});

// PATCH /customers/:id — update existing customer
customersRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  try {
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        city: body.city,
        state: body.state,
        preferredCategory: body.preferredCategory,
      },
    });
    return c.json({ success: true, data: customer });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update customer' }, 400);
  }
});
