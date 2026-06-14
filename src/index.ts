import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { serve } from '@hono/node-server';

import { authRouter } from './routes/auth.js';
import { customersRouter } from './routes/customers.js';
import { ordersRouter } from './routes/orders.js';
import { segmentsRouter } from './routes/segments.js';
import { campaignsRouter } from './routes/campaigns.js';
import { aiRouter } from './routes/ai.js';
import { callbacksRouter } from './routes/callbacks.js';
import { analyticsRouter } from './routes/analytics.js';
import { trackingRouter } from './routes/tracking.js';
import cartsRouter from './routes/carts.js';
import { initWorkers } from './queues/workers/index.js';
import { initScheduler } from './scheduler/index.js';
import { prisma } from './lib/prisma.js';

const app = new Hono();

// --- Middleware ---
app.use('*', cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));
app.use('*', logger());
app.use('*', prettyJSON());

// --- Health Check ---
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// --- API Routes ---
app.route('/api/auth', authRouter);
app.route('/api/customers', customersRouter);
app.route('/api/orders', ordersRouter);
app.route('/api/segments', segmentsRouter);
app.route('/api/campaigns', campaignsRouter);
app.route('/api/ai', aiRouter);
app.route('/api/callbacks', callbacksRouter);
app.route('/api/analytics', analyticsRouter);
app.route('/api/tracking', trackingRouter);
app.route('/api/carts', cartsRouter);

// --- Global Error Handler ---
app.onError((err, c) => {
  console.error('[ERROR]', err);
  return c.json({ success: false, error: err.message || 'Internal server error' }, 500);
});

app.notFound((c) => c.json({ success: false, error: 'Not found' }, 404));

// --- Startup ---
const PORT = Number(process.env.PORT) || 3000;

async function bootstrap() {
  try {
    // Test DB connection
    await prisma.$connect();
    console.log('✅ Database connected');

    // Start BullMQ workers (non-blocking)
    initWorkers().catch(err => console.error('❌ Worker init failed:', err));
    console.log('✅ Queue workers starting in background');

    // Start scheduler (monthly campaigns)
    initScheduler();
    console.log('✅ Scheduler started');

    // Start HTTP server
    serve({ fetch: app.fetch, port: PORT }, () => {
      console.log(`🚀 XENO CRM Backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Startup failed:', err);
    process.exit(1);
  }
}

bootstrap();
