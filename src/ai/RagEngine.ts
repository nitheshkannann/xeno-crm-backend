import { PrismaClient } from '@prisma/client';
import { generateEmbedding } from './GeminiClient.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../lib/prisma.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export async function chatWithRag(
  query: string,
  history: ChatMessage[] = []
) {
  // 1. Generate embedding for the user's query
  const queryEmbedding = await generateEmbedding(query);
  const embeddingString = `[${queryEmbedding.join(',')}]`;

  // 2. Perform vector search to find top 5 relevant campaign memories
  // Using cosine distance (<=>)
  const relevantMemories = await prisma.$queryRaw<Array<{
    id: string;
    segmentDescription: string;
    channel: string;
    audienceSize: number;
    openRate: number;
    clickRate: number;
    conversionRate: number;
    revenueGenerated: number;
    notes: string;
    distance: number;
  }>>`
    SELECT 
      "id",
      "segmentDescription",
      "channel",
      "audienceSize",
      "openRate",
      "clickRate",
      "conversionRate",
      "revenueGenerated",
      "notes",
      "embedding" <=> ${embeddingString}::vector AS distance
    FROM marketing_memory
    ORDER BY distance ASC
    LIMIT 5
  `;

  // 3. Construct Context String
  let contextText = 'HISTORICAL CAMPAIGN MEMORY:\n';
  if (relevantMemories.length === 0) {
    contextText += 'No historical data found.\n';
  } else {
    for (const mem of relevantMemories) {
      contextText += `
---
Segment: ${mem.segmentDescription}
Channel: ${mem.channel}
Audience Size: ${mem.audienceSize}
Open Rate: ${(mem.openRate * 100).toFixed(1)}%
Click Rate: ${(mem.clickRate * 100).toFixed(1)}%
Conversion Rate: ${(mem.conversionRate * 100).toFixed(1)}%
Revenue Generated: ₹${mem.revenueGenerated}
Notes & Insights: ${mem.notes || 'N/A'}
`;
    }
  }

  // 4. Formulate System Instructions
  const systemInstruction = `
You are the XENO Marketing Intelligence Agent, a virtual marketing strategist powered by RAG.
You have access to the company's historical campaign database via semantic search.

Use the following retrieved context to answer the user's question. 
If the retrieved context does not contain enough information to fully answer the question, state what is missing, but still provide your best strategic advice based on general marketing best practices.

Always strive to:
1. Be data-driven and reference the specific metrics from past campaigns (e.g., open rates, conversion rates).
2. Estimate the business impact and expected revenue when recommending new segments or offers.
3. Be concise but strategic. Use markdown formatting (bullet points, bold text) to make your response readable.

${contextText}
  `.trim();

  // 5. Initialize Chat Session
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction,
  });

  const chat = model.startChat({
    history,
  });

  // 6. Generate Response Stream
  const result = await chat.sendMessageStream(query);
  return result.stream;
}
