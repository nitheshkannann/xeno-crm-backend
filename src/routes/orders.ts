import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

export const ordersRouter = new Hono();
ordersRouter.use('*', authMiddleware);

ordersRouter.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');
  const search = c.req.query('search') || '';
  const status = c.req.query('status') || '';

  const where = {
    AND: [
      search ? {
        customer: {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        },
      } : {},
      status ? { status: status as never } : {},
    ],
  };

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, email: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return c.json({
    success: true,
    data: orders,
    pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
});

ordersRouter.get('/:id', async (c) => {
  const order = await prisma.order.findUnique({
    where: { id: c.req.param('id') },
    include: { 
      customer: true,
      campaign: { select: { id: true, name: true } },
    },
  });
  if (!order) return c.json({ success: false, error: 'Order not found' }, 404);
  return c.json({ success: true, data: order });
});

ordersRouter.post('/', async (c) => {
  const body = await c.req.json();
  const { customerId, amount, items } = body;

  if (!customerId || !amount || !items) {
    return c.json({ success: false, error: 'Missing required fields: customerId, amount, items' }, 400);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the order
      const newOrder = await tx.order.create({
        data: {
          customerId,
          amount,
          items,
          status: 'DELIVERED',
        },
      });

      // 2. Fetch current customer stats
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) throw new Error('Customer not found');

      // 3. Calculate new metrics
      const newTotalSpend = customer.totalSpend + amount;
      const newOrderCount = customer.orderCount + 1;
      const newAvgOrderValue = newTotalSpend / newOrderCount;
      
      // Boost health score by 20 points, max 100
      const newHealthScore = Math.min(100, customer.healthScore + 20);
      
      let newHealthLabel = customer.healthLabel;
      if (newHealthScore >= 80) newHealthLabel = 'HIGHLY_LOYAL';
      else if (newHealthScore >= 50) newHealthLabel = 'ACTIVE';

      // 4. Update the customer profile
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

      return newOrder;
    });

    return c.json({ success: true, data: result }, 201);
  } catch (error) {
    console.error('Failed to create order:', error);
    return c.json({ success: false, error: 'Failed to create order and update profile' }, 500);
  }
});
