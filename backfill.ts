import { PrismaClient } from '@prisma/client';
import { generateEmbedding } from './src/ai/GeminiClient.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Backfilling embeddings for MarketingMemory...');
  
  const memories = await prisma.marketingMemory.findMany();
  
  for (const memory of memories) {
    const memoryText = `
Segment: ${memory.segmentDescription}
Channel: ${memory.channel}
Audience Size: ${memory.audienceSize}
Open Rate: ${(memory.openRate * 100).toFixed(1)}%
Click Rate: ${(memory.clickRate * 100).toFixed(1)}%
Conversion Rate: ${(memory.conversionRate * 100).toFixed(1)}%
Revenue Generated: ₹${memory.revenueGenerated}
Summary: ${memory.notes || 'N/A'}
    `.trim();

    const embedding = await generateEmbedding(memoryText);
    
    await prisma.$executeRaw`
      UPDATE marketing_memory
      SET embedding = ${`[${embedding.join(',')}]`}::vector
      WHERE id = ${memory.id}
    `;
    console.log(`✅ Generated embedding for memory ${memory.id}`);
  }
  
  console.log('🎉 Done backfilling embeddings!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
