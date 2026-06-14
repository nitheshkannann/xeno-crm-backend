import { generateStructured } from './GeminiClient.js';
import type { FilterGroup } from '@xeno/types';
import { prisma } from '../lib/prisma.js';

interface AISegmentResult {
  filterRules: FilterGroup;
  explanation: string;
  segmentName: string;
  segmentDescription: string;
}

const SEGMENT_SCHEMA = {
  type: 'object',
  properties: {
    segmentName: { type: 'string' },
    segmentDescription: { type: 'string' },
    explanation: { type: 'string' },
    filterRules: {
      type: 'object',
      properties: {
        logic: { type: 'string', enum: ['AND', 'OR', 'NOT'] },
        rules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'has'] },
              value: { type: 'string' },
            },
            required: ['field', 'operator', 'value'],
          },
        },
      },
      required: ['logic', 'rules'],
    },
  },
  required: ['segmentName', 'segmentDescription', 'explanation', 'filterRules'],
};

const AVAILABLE_FIELDS = `
Available filter fields (use EXACT field names):
- daysSinceLastOrder (number): days since customer's last purchase
- totalSpend (number): total lifetime spend in INR
- orderCount (number): total number of orders
- avgOrderValue (number): average order value in INR
- city (string): customer's city (e.g., "Mumbai", "Chennai", "Delhi")
- state (string): customer's state
- gender (string): "MALE", "FEMALE", or "OTHER"
- preferredCategory (string): "Shoes", "Clothing", "Electronics", "Books", "Home & Kitchen", "Beauty", "Sports", "Accessories"
- emailOpenRate (number, 0-1): email open rate (0.3 = 30%)
- emailClickRate (number, 0-1): email click rate
- healthScore (number, 0-100): customer health score
- healthLabel (string): "HIGHLY_LOYAL", "ACTIVE", "AT_RISK", or "CHURN_RISK"
- tags (string): customer tags - "vip", "new", "seasonal", "discount_seeker", "brand_loyal"

Available operators: eq, neq, gt, gte, lt, lte, in, not_in, contains, has
All numeric values should be strings in the JSON (e.g., "30", "5000").
`;

export async function buildSegmentFromNL(prompt: string, memoryContext: string = ''): Promise<AISegmentResult> {
  const systemPrompt = `You are an expert marketing data analyst for an Indian e-commerce brand.
Your job is to convert a natural language segment description into structured filter rules.

${AVAILABLE_FIELDS}

${memoryContext ? `Historical context from past campaigns:\n${memoryContext}\n` : ''}

Generate a precise, actionable customer segment based on the user's request.
The segmentName should be concise (max 50 chars).
The explanation should explain WHY this segment is valuable and what the filters mean.
`;

  const result = await generateStructured<AISegmentResult>(
    `${systemPrompt}\n\nUser request: "${prompt}"`,
    SEGMENT_SCHEMA,
  );

  return result;
}

export async function getMemoryContext(): Promise<string> {
  const memories = await prisma.marketingMemory.findMany({
    orderBy: { conversionRate: 'desc' },
    take: 5,
  });

  if (memories.length === 0) return '';

  return memories.map(m =>
    `- Segment: "${m.segmentDescription}" via ${m.channel} → Open: ${(m.openRate * 100).toFixed(0)}%, Click: ${(m.clickRate * 100).toFixed(0)}%, Conversion: ${(m.conversionRate * 100).toFixed(0)}% (${m.performanceLabel} performance). Notes: ${m.notes || 'N/A'}`,
  ).join('\n');
}
