import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';
import { checkAbandonedCarts } from '../scheduler/index.js';

const carts = new Hono();

// POST /api/carts/trigger-agent
carts.post('/trigger-agent', async (c) => {
  try {
    await checkAbandonedCarts();
    return c.json({ success: true, message: 'Agent triggered successfully' });
  } catch (error) {
    console.error('Error triggering cart agent:', error);
    return c.json({ error: 'Failed to trigger agent' }, 500);
  }
});

// GET /api/carts/abandoned
// Fetch all abandoned carts with their customer details
carts.get('/abandoned', async (c) => {
  try {
    const abandonedCarts = await prisma.cart.findMany({
      where: {
        status: 'ABANDONED',
      },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          }
        }
      },
      orderBy: {
        lastActiveAt: 'desc',
      }
    });

    return c.json({ success: true, data: abandonedCarts });
  } catch (error) {
    console.error('Error fetching abandoned carts:', error);
    return c.json({ error: 'Failed to fetch abandoned carts' }, 500);
  }
});

// GET /api/carts/history/:customerId
// Fetch completed carts for a specific customer
carts.get('/history/:customerId', async (c) => {
  try {
    const customerId = c.req.param('customerId');
    const history = await prisma.cart.findMany({
      where: {
        customerId,
        status: 'COMPLETED',
      },
      orderBy: {
        createdAt: 'desc',
      }
    });

    return c.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching cart history:', error);
    return c.json({ error: 'Failed to fetch cart history' }, 500);
  }
});

export default carts;
