import { PrismaClient, Gender, HealthLabel, OrderStatus, Channel, UserRole } from '@prisma/client';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Indian cities distribution
const cities = [
  { city: 'Mumbai', state: 'Maharashtra', weight: 15 },
  { city: 'Delhi', state: 'Delhi', weight: 14 },
  { city: 'Bangalore', state: 'Karnataka', weight: 13 },
  { city: 'Chennai', state: 'Tamil Nadu', weight: 10 },
  { city: 'Hyderabad', state: 'Telangana', weight: 9 },
  { city: 'Pune', state: 'Maharashtra', weight: 8 },
  { city: 'Kolkata', state: 'West Bengal', weight: 7 },
  { city: 'Ahmedabad', state: 'Gujarat', weight: 6 },
  { city: 'Jaipur', state: 'Rajasthan', weight: 5 },
  { city: 'Surat', state: 'Gujarat', weight: 4 },
  { city: 'Lucknow', state: 'Uttar Pradesh', weight: 4 },
  { city: 'Kochi', state: 'Kerala', weight: 3 },
  { city: 'Chandigarh', state: 'Punjab', weight: 2 },
];

const categories = ['Shoes', 'Clothing', 'Electronics', 'Books', 'Home & Kitchen', 'Beauty', 'Sports', 'Accessories'];

const products: Record<string, string[]> = {
  Shoes: ['Nike Air Max', 'Adidas Ultraboost', 'Puma RS-X', 'Reebok Classic', 'New Balance 574'],
  Clothing: ['Levi\'s 501 Jeans', 'Allen Solly Shirt', 'Van Heusen T-Shirt', 'Arrow Trousers', 'Raymond Suit'],
  Electronics: ['boAt Airdopes', 'Realme Buds', 'Sony WH-1000XM5', 'JBL Flip 6', 'Apple AirPods'],
  Books: ['Atomic Habits', 'The Alchemist', 'Rich Dad Poor Dad', 'Ikigai', 'Think and Grow Rich'],
  'Home & Kitchen': ['Prestige Cooker', 'Philips Mixer', 'Milton Flask', 'Cello Water Bottle', 'Borosil Glass Set'],
  Beauty: ['Lakme Foundation', 'Maybelline Lipstick', 'L\'Oreal Shampoo', 'Dove Body Lotion', 'WOW Face Wash'],
  Sports: ['Yonex Badminton Racket', 'Nivia Football', 'Cosco Cricket Bat', 'Decathlon Yoga Mat', 'STRAUSS Resistance Bands'],
  Accessories: ['Fossil Watch', 'Hidesign Wallet', 'Da Milano Handbag', 'Titan Sunglasses', 'Wildcraft Backpack'],
};

function weightedRandom<T>(items: { weight: number; [key: string]: unknown }[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let rand = Math.random() * total;
  for (const item of items) {
    rand -= item.weight;
    if (rand <= 0) return item as unknown as T;
  }
  return items[items.length - 1] as unknown as T;
}

function computeHealthScore(params: {
  daysSinceLastOrder: number | null;
  orderCount: number;
  totalSpend: number;
  emailOpenRate: number;
  emailClickRate: number;
}): { score: number; label: HealthLabel } {
  const { daysSinceLastOrder, orderCount, totalSpend, emailOpenRate, emailClickRate } = params;

  // Recency score (0-25): closer = higher
  let recency = 0;
  if (daysSinceLastOrder !== null) {
    if (daysSinceLastOrder <= 15) recency = 25;
    else if (daysSinceLastOrder <= 30) recency = 20;
    else if (daysSinceLastOrder <= 60) recency = 15;
    else if (daysSinceLastOrder <= 90) recency = 10;
    else if (daysSinceLastOrder <= 180) recency = 5;
    else recency = 0;
  }

  // Frequency score (0-25)
  let frequency = 0;
  if (orderCount >= 20) frequency = 25;
  else if (orderCount >= 10) frequency = 20;
  else if (orderCount >= 5) frequency = 15;
  else if (orderCount >= 3) frequency = 10;
  else if (orderCount >= 1) frequency = 5;

  // Monetary score (0-25)
  let monetary = 0;
  if (totalSpend >= 50000) monetary = 25;
  else if (totalSpend >= 20000) monetary = 20;
  else if (totalSpend >= 10000) monetary = 15;
  else if (totalSpend >= 5000) monetary = 10;
  else if (totalSpend >= 1000) monetary = 5;

  // Engagement score (0-25)
  const engagementAvg = (emailOpenRate + emailClickRate) / 2;
  let engagement = 0;
  if (engagementAvg >= 0.6) engagement = 25;
  else if (engagementAvg >= 0.4) engagement = 20;
  else if (engagementAvg >= 0.25) engagement = 15;
  else if (engagementAvg >= 0.1) engagement = 10;
  else engagement = 5;

  const score = recency + frequency + monetary + engagement;

  let label: HealthLabel;
  if (score >= 80) label = HealthLabel.HIGHLY_LOYAL;
  else if (score >= 60) label = HealthLabel.ACTIVE;
  else if (score >= 40) label = HealthLabel.AT_RISK;
  else label = HealthLabel.CHURN_RISK;

  return { score, label };
}

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data
  await prisma.deliveryEvent.deleteMany();
  await prisma.campaignLog.deleteMany();
  await prisma.campaignVariant.deleteMany();
  await prisma.aIInsight.deleteMany();
  await prisma.marketingMemory.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.segmentMembership.deleteMany();
  await prisma.segment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  await prisma.analyticsSnapshot.deleteMany();

  console.log('🗑️  Cleared existing data');

  // Seed admin user
  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.createMany({
    data: [
      {
        email: 'admin@xeno.com',
        passwordHash,
        name: 'Arjun Sharma',
        role: UserRole.ADMIN,
      },
      {
        email: 'marketer@xeno.com',
        passwordHash: await bcrypt.hash('marketer123', 10),
        name: 'Priya Nair',
        role: UserRole.MARKETER,
      },
    ],
  });
  console.log('👤 Created users: admin@xeno.com / admin123');

  // Seed 1000 customers
  console.log('👥 Seeding 1000 customers...');
  const customerData: Parameters<typeof prisma.customer.create>[0]['data'][] = [];

  for (let i = 0; i < 1000; i++) {
    const gender = Math.random() > 0.45 ? 'MALE' : Math.random() > 0.1 ? 'FEMALE' : 'OTHER';
    const firstName = gender === 'MALE'
      ? faker.helpers.arrayElement(['Rahul', 'Amit', 'Vijay', 'Suresh', 'Rajesh', 'Anil', 'Sanjay', 'Deepak', 'Manoj', 'Pradeep', 'Ravi', 'Arjun', 'Kiran', 'Naveen', 'Ashok'])
      : faker.helpers.arrayElement(['Priya', 'Anjali', 'Sunita', 'Pooja', 'Divya', 'Kavita', 'Meena', 'Rekha', 'Anita', 'Sonia', 'Nisha', 'Ritu', 'Preeti', 'Shweta', 'Deepa']);
    const lastName = faker.helpers.arrayElement(['Sharma', 'Verma', 'Singh', 'Kumar', 'Gupta', 'Patel', 'Shah', 'Joshi', 'Reddy', 'Nair', 'Iyer', 'Mehta', 'Agarwal', 'Bose', 'Das']);

    const locationData = weightedRandom<{ city: string; state: string; weight: number }>(cities);
    const preferredCategory = faker.helpers.arrayElement(categories);

    // Determine customer archetype for realistic data
    const archetype = Math.random();
    let daysSinceLastOrder: number;
    let orderCount: number;
    let totalSpend: number;

    if (archetype < 0.15) {
      // Highly loyal: recent, frequent, high spend
      daysSinceLastOrder = faker.number.int({ min: 1, max: 20 });
      orderCount = faker.number.int({ min: 12, max: 30 });
      totalSpend = faker.number.float({ min: 25000, max: 100000 });
    } else if (archetype < 0.35) {
      // Active: moderate recency and frequency
      daysSinceLastOrder = faker.number.int({ min: 10, max: 45 });
      orderCount = faker.number.int({ min: 4, max: 12 });
      totalSpend = faker.number.float({ min: 5000, max: 25000 });
    } else if (archetype < 0.60) {
      // At risk: starting to go inactive
      daysSinceLastOrder = faker.number.int({ min: 30, max: 90 });
      orderCount = faker.number.int({ min: 2, max: 8 });
      totalSpend = faker.number.float({ min: 2000, max: 15000 });
    } else {
      // Churn risk: long inactive or new with low spend
      daysSinceLastOrder = faker.number.int({ min: 60, max: 365 });
      orderCount = faker.number.int({ min: 1, max: 4 });
      totalSpend = faker.number.float({ min: 500, max: 8000 });
    }

    const avgOrderValue = orderCount > 0 ? totalSpend / orderCount : 0;
    const emailOpenRate = faker.number.float({ min: 0.05, max: 0.75 });
    const emailClickRate = faker.number.float({ min: 0, max: emailOpenRate * 0.7 });
    const lastOrderDate = new Date(Date.now() - daysSinceLastOrder * 86400000);

    const { score, label } = computeHealthScore({
      daysSinceLastOrder,
      orderCount,
      totalSpend,
      emailOpenRate,
      emailClickRate,
    });

    customerData.push({
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
      firstName,
      lastName,
      phone: `+91 ${faker.string.numeric(5)} ${faker.string.numeric(5)}`,
      gender: gender as Gender,
      city: locationData.city,
      state: locationData.state,
      preferredCategory,
      tags: faker.helpers.arrayElements(['vip', 'new', 'seasonal', 'discount_seeker', 'brand_loyal'], { min: 0, max: 2 }),
      totalSpend: Math.round(totalSpend),
      orderCount,
      avgOrderValue: Math.round(avgOrderValue),
      lastOrderDate,
      daysSinceLastOrder,
      emailOpenRate: Math.round(emailOpenRate * 100) / 100,
      emailClickRate: Math.round(emailClickRate * 100) / 100,
      healthScore: score,
      healthLabel: label,
      createdAt: faker.date.past({ years: 3 }),
    });
  }

  // Batch insert customers
  for (let i = 0; i < customerData.length; i += 100) {
    const batch = customerData.slice(i, i + 100);
    await Promise.all(batch.map(data => prisma.customer.create({ data: data as Parameters<typeof prisma.customer.create>[0]['data'] })));
  }
  console.log('✅ 1000 customers created');

  // Seed orders (10 per customer avg)
  console.log('📦 Seeding orders...');
  const customers = await prisma.customer.findMany({ select: { id: true, orderCount: true, totalSpend: true, preferredCategory: true, lastOrderDate: true } });

  let orderCount = 0;
  for (const customer of customers) {
    const numOrders = customer.orderCount;
    const avgAmount = customer.orderCount > 0 ? customer.totalSpend / customer.orderCount : 1000;

    for (let o = 0; o < numOrders; o++) {
      const category = customer.preferredCategory || faker.helpers.arrayElement(categories);
      const categoryProducts = products[category] || products['Clothing'];
      const itemCount = faker.number.int({ min: 1, max: 4 });
      const items = Array.from({ length: itemCount }, () => {
        const itemMin = 300;
        const itemMax = Math.max(itemMin + 100, Math.round(avgAmount * 0.8));
        return {
          name: faker.helpers.arrayElement(categoryProducts),
          category,
          price: Math.round(faker.number.int({ min: itemMin, max: itemMax })),
          qty: faker.number.int({ min: 1, max: 3 }),
        };
      });
      const amount = items.reduce((sum, item) => sum + item.price * item.qty, 0);

      const daysAgo = faker.number.int({ min: o === 0 && customer.lastOrderDate
        ? Math.floor((Date.now() - customer.lastOrderDate.getTime()) / 86400000)
        : 0, max: 365 * 3 });

      await prisma.order.create({
        data: {
          customerId: customer.id,
          amount,
          status: faker.helpers.weightedArrayElement([
            { value: OrderStatus.DELIVERED, weight: 80 },
            { value: OrderStatus.RETURNED, weight: 8 },
            { value: OrderStatus.CANCELLED, weight: 7 },
            { value: OrderStatus.SHIPPED, weight: 5 },
          ]),
          items,
          createdAt: new Date(Date.now() - daysAgo * 86400000),
        },
      });
      orderCount++;
    }
  }
  console.log(`✅ ${orderCount} orders created`);

  // Seed sample segments
  console.log('🎯 Seeding segments...');
  const segments = [
    {
      name: 'High-Value Inactive (30-60 days)',
      description: 'Customers with high spend who haven\'t ordered in 30-60 days',
      filterRules: {
        logic: 'AND',
        rules: [
          { field: 'daysSinceLastOrder', operator: 'gte', value: 30 },
          { field: 'daysSinceLastOrder', operator: 'lte', value: 60 },
          { field: 'totalSpend', operator: 'gte', value: 5000 },
        ],
      },
      isAutoScheduled: true,
      autoObjective: 'Re-engage high-value customers before they churn',
      preferredChannel: Channel.EMAIL,
    },
    {
      name: 'Churn Risk — VIP',
      description: 'VIP customers (high spend) who are at risk of churning (90+ days inactive)',
      filterRules: {
        logic: 'AND',
        rules: [
          { field: 'daysSinceLastOrder', operator: 'gte', value: 90 },
          { field: 'totalSpend', operator: 'gte', value: 20000 },
        ],
      },
      isAutoScheduled: false,
      preferredChannel: Channel.WHATSAPP,
    },
    {
      name: 'Active Loyalists — Chennai',
      description: 'Active and loyal customers in Chennai for geo-targeted campaigns',
      filterRules: {
        logic: 'AND',
        rules: [
          { field: 'city', operator: 'eq', value: 'Chennai' },
          { field: 'healthLabel', operator: 'eq', value: 'HIGHLY_LOYAL' },
        ],
      },
      isAutoScheduled: false,
      preferredChannel: Channel.EMAIL,
    },
    {
      name: 'At-Risk Shoe Buyers',
      description: 'Customers who prefer shoes and are showing at-risk signals',
      filterRules: {
        logic: 'AND',
        rules: [
          { field: 'preferredCategory', operator: 'eq', value: 'Shoes' },
          { field: 'healthLabel', operator: 'eq', value: 'AT_RISK' },
        ],
      },
      isAutoScheduled: true,
      autoObjective: 'Win back shoe buyers before they switch brands',
      preferredChannel: Channel.SMS,
    },
    {
      name: 'New Customers — First 90 Days',
      description: 'Recently acquired customers to onboard and nurture',
      filterRules: {
        logic: 'AND',
        rules: [
          { field: 'orderCount', operator: 'lte', value: 2 },
          { field: 'daysSinceLastOrder', operator: 'lte', value: 90 },
        ],
      },
      isAutoScheduled: false,
      preferredChannel: Channel.EMAIL,
    },
  ];

  for (const seg of segments) {
    await prisma.segment.create({ data: { ...seg, customerCount: faker.number.int({ min: 50, max: 400 }) } });
  }
  console.log('✅ 5 segments created');

  // Seed marketing memory (historical campaign performance)
  console.log('🧠 Seeding marketing memory...');
  await prisma.marketingMemory.createMany({
    data: [
      {
        segmentDescription: 'Inactive customers 30-60 days, spend >5000',
        segmentCriteria: { daysSinceLastOrder: { gte: 30, lte: 60 }, totalSpend: { gte: 5000 } },
        channel: Channel.EMAIL,
        audienceSize: 312,
        openRate: 0.62,
        clickRate: 0.28,
        conversionRate: 0.18,
        revenueGenerated: 142800,
        performanceLabel: 'high',
        notes: 'Discount angle (Variant C) performed best with 2.8x baseline conversion. Subject line personalization drove 40% higher open rates.',
      },
      {
        segmentDescription: 'Churn risk VIP customers, 90+ days inactive',
        segmentCriteria: { daysSinceLastOrder: { gte: 90 }, totalSpend: { gte: 20000 } },
        channel: Channel.WHATSAPP,
        audienceSize: 89,
        openRate: 0.71,
        clickRate: 0.35,
        conversionRate: 0.12,
        revenueGenerated: 98500,
        performanceLabel: 'medium',
        notes: 'WhatsApp had highest open rate. VIP exclusive offer worked better than discount for this segment.',
      },
      {
        segmentDescription: 'Active customers, recent buyers, upsell',
        segmentCriteria: { daysSinceLastOrder: { lte: 30 }, orderCount: { gte: 5 } },
        channel: Channel.EMAIL,
        audienceSize: 445,
        openRate: 0.44,
        clickRate: 0.19,
        conversionRate: 0.09,
        revenueGenerated: 87200,
        performanceLabel: 'medium',
        notes: 'New arrivals angle worked best for active customers. Urgency variant underperformed.',
      },
      {
        segmentDescription: 'At-risk customers, 45-90 days inactive',
        segmentCriteria: { daysSinceLastOrder: { gte: 45, lte: 90 } },
        channel: Channel.SMS,
        audienceSize: 278,
        openRate: 0.38,
        clickRate: 0.15,
        conversionRate: 0.07,
        revenueGenerated: 34600,
        performanceLabel: 'low',
        notes: 'SMS had lower engagement than email for this cohort. Recommend switching to email channel next time.',
      },
    ],
  });
  console.log('✅ Marketing memory seeded');

  // Seed analytics snapshots for last 30 days
  console.log('📊 Seeding analytics snapshots...');
  for (let d = 29; d >= 0; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    date.setHours(0, 0, 0, 0);

    const messagesSent = faker.number.int({ min: 0, max: 500 });
    const delivered = Math.floor(messagesSent * faker.number.float({ min: 0.88, max: 0.96 }));
    const opened = Math.floor(delivered * faker.number.float({ min: 0.30, max: 0.65 }));
    const clicked = Math.floor(opened * faker.number.float({ min: 0.15, max: 0.35 }));
    const converted = Math.floor(clicked * faker.number.float({ min: 0.10, max: 0.25 }));

    await prisma.analyticsSnapshot.upsert({
      where: { date },
      create: {
        date,
        totalCustomers: 1000,
        activeCustomers: faker.number.int({ min: 320, max: 380 }),
        newCustomers: faker.number.int({ min: 0, max: 15 }),
        campaignsSent: faker.number.int({ min: 0, max: 3 }),
        messagesSent,
        delivered,
        opened,
        clicked,
        converted,
        revenue: converted * faker.number.float({ min: 800, max: 3500 }),
      },
      update: {},
    });
  }
  console.log('✅ 30 days of analytics snapshots created');

  console.log('\n🎉 Seed complete!');
  console.log('\n📝 Login credentials:');
  console.log('   Admin:    admin@xeno.com / admin123');
  console.log('   Marketer: marketer@xeno.com / marketer123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
