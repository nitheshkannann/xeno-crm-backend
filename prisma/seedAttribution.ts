import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Attributing existing orders to campaigns...');

  const campaigns = await prisma.campaign.findMany();
  if (campaigns.length === 0) {
    console.log('⚠️ No campaigns found. Create some campaigns first to test attribution.');
    return;
  }

  const orders = await prisma.order.findMany({
    where: { campaignId: null },
  });

  if (orders.length === 0) {
    console.log('✅ All orders already attributed.');
    return;
  }

  let attributedCount = 0;
  for (const order of orders) {
    // 30% chance an order is attributed to a random campaign
    if (Math.random() < 0.3) {
      const randomCampaign = campaigns[Math.floor(Math.random() * campaigns.length)];
      await prisma.order.update({
        where: { id: order.id },
        data: { campaignId: randomCampaign.id },
      });
      attributedCount++;
    }
  }

  console.log(`🎉 Attributed ${attributedCount} orders to random campaigns.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
