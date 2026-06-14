import { PrismaClient, CartStatus, Gender } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

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

async function main() {
  console.log('🛒 Starting Cart Seed...');

  // 1. Create 50 dedicated customers for cart testing so we don't pollute existing
  console.log('👥 Creating 50 dedicated cart customers...');
  const customersToCreate = [];
  for (let i = 0; i < 50; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    customersToCreate.push({
      email: `cart_test_${i}_${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
      firstName,
      lastName,
      city: faker.location.city(),
      createdAt: new Date(),
    });
  }

  await prisma.customer.createMany({ data: customersToCreate });
  const cartCustomers = await prisma.customer.findMany({
    where: { email: { startsWith: 'cart_test_' } },
    select: { id: true }
  });

  console.log(`✅ Created ${cartCustomers.length} cart customers`);

  // 2. Seed Carts
  console.log('🛍️  Seeding Carts (Active, Abandoned, Completed)...');
  
  let cartCount = 0;
  for (let i = 0; i < cartCustomers.length; i++) {
    const customer = cartCustomers[i];
    
    // Randomize cart status
    const rand = Math.random();
    let status: CartStatus = 'ACTIVE';
    let minutesAgo = 0;

    if (rand < 0.33) {
      status = 'ACTIVE';
      minutesAgo = faker.number.int({ min: 1, max: 9 }); // Less than 10 mins
    } else if (rand < 0.66) {
      status = 'ACTIVE'; // Will be picked up by agent as abandoned since > 10 mins
      minutesAgo = faker.number.int({ min: 15, max: 120 }); // Between 15 mins and 2 hours
    } else {
      status = 'COMPLETED';
      minutesAgo = faker.number.int({ min: 1440, max: 10000 }); // Days ago
    }

    const category = faker.helpers.arrayElement(categories);
    const categoryProducts = products[category];
    const itemCount = faker.number.int({ min: 1, max: 4 });
    const items = Array.from({ length: itemCount }, () => {
      const price = Math.round(faker.number.float({ min: 500, max: 5000 }));
      const qty = faker.number.int({ min: 1, max: 3 });
      return {
        name: faker.helpers.arrayElement(categoryProducts),
        category,
        price,
        qty,
      };
    });

    const totalValue = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const lastActiveAt = new Date(Date.now() - minutesAgo * 60000);

    await prisma.cart.create({
      data: {
        customerId: customer.id,
        items,
        totalValue,
        status,
        lastActiveAt,
        createdAt: new Date(lastActiveAt.getTime() - 5 * 60000), // created 5 mins before last active
      }
    });
    cartCount++;
  }

  console.log(`✅ Seeded ${cartCount} carts.`);
  console.log('🎉 Cart Seed Complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
