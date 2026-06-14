import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npx tsx prisma/simulatePurchase.ts <customer-email>');
    process.exit(1);
  }

  const customer = await prisma.customer.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } }
  });

  if (!customer) {
    console.error(`Customer with email ${email} not found.`);
    process.exit(1);
  }

  const amount = Math.floor(Math.random() * 5000) + 1000;
  const items = [
    { name: 'Simulated Item 1', category: 'Testing', price: Math.floor(amount * 0.4), qty: 1 },
    { name: 'Simulated Item 2', category: 'Testing', price: Math.floor(amount * 0.6), qty: 1 },
  ];

  console.log(`🛒 Creating a new order for ${customer.firstName} ${customer.lastName} (${amount} INR)...`);

  const result = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        customerId: customer.id,
        amount,
        items,
        status: 'DELIVERED',
      },
    });

    const newTotalSpend = customer.totalSpend + amount;
    const newOrderCount = customer.orderCount + 1;
    const newAvgOrderValue = newTotalSpend / newOrderCount;
    
    // Boost health score massively for testing (make them ACTIVE immediately)
    const newHealthScore = Math.min(100, customer.healthScore + 50);
    
    let newHealthLabel = customer.healthLabel;
    if (newHealthScore >= 80) newHealthLabel = 'HIGHLY_LOYAL';
    else if (newHealthScore >= 50) newHealthLabel = 'ACTIVE';

    await tx.customer.update({
      where: { id: customer.id },
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

    return { newOrder, newHealthScore, newHealthLabel };
  });

  console.log('✅ Purchase successful!');
  console.log(`📈 New Health Score: ${result.newHealthScore}`);
  console.log(`🏷️ New Health Label: ${result.newHealthLabel}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
