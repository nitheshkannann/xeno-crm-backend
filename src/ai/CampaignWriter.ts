import { generateStructured } from './GeminiClient.js';
import type { AICampaignVariant, Channel } from '@xeno/types';

interface CampaignWriterInput {
  objective: string;
  channel: Channel;
  segmentDescription: string;
  segmentSize: number;
  brandName?: string;
}

interface CampaignVariantsResult {
  variants: AICampaignVariant[];
  recommendedVariantLabel: string;
  strategyNote: string;
}

const VARIANTS_SCHEMA = {
  type: 'object',
  properties: {
    recommendedVariantLabel: { type: 'string' },
    strategyNote: { type: 'string' },
    variants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          angle: { type: 'string' },
          subject: { type: 'string' },
          body: { type: 'string' },
          targetProfile: { type: 'string' },
        },
        required: ['label', 'angle', 'body', 'targetProfile'],
      },
    },
  },
  required: ['variants', 'recommendedVariantLabel', 'strategyNote'],
};

/**
 * Generate 4 campaign message variants for a campaign.
 * One Gemini call → 4 variants → assigned to customers by profile fit.
 *
 * Variables supported in templates:
 * {{first_name}}, {{last_order_date}}, {{total_spend}}, {{preferred_category}},
 * {{city}}, {{order_count}}, {{avg_order_value}}
 */
export async function generateCampaignVariants(input: CampaignWriterInput): Promise<CampaignVariantsResult> {
  const channelGuidelines: Record<Channel, string> = {
    EMAIL: 'Include a subject line. Body can be 3-5 sentences with clear CTA. HTML-friendly.',
    SMS: 'No subject line. Body must be under 160 characters. Include a short link placeholder [LINK].',
    WHATSAPP: 'No subject line. Conversational tone. 2-3 sentences max. Can use emojis.',
    PUSH: 'No subject line. Body is a push notification — max 1 sentence (80 chars). Very punchy.',
  };

  const prompt = `You are a world-class marketing copywriter for an Indian e-commerce brand.

Campaign Objective: ${input.objective}
Target Channel: ${input.channel}
Target Segment: ${input.segmentDescription}
Audience Size: ${input.segmentSize} customers
Brand: ${input.brandName || 'Xeno'}

Channel Guidelines: ${channelGuidelines[input.channel]}

Generate exactly 4 message variants with different angles:
1. Discount/Offer angle — for price-sensitive customers
2. Loyalty/VIP angle — for high-value customers
3. Urgency/FOMO angle — for impulse buyers
4. Personalized/New arrivals angle — for explorers

IMPORTANT:
- Copy MUST be extremely catchy, energetic, and highly engaging.
- Write like a top-tier D2C copywriter: hook the reader instantly, focus on benefits, and use persuasive language.
- Keep sentences short, punchy, and modern. NO boring or overly formal corporate language!
- Use these template variables where appropriate: {{first_name}}, {{last_order_date}}, {{total_spend}}, {{preferred_category}}, {{city}}, {{order_count}}, {{avg_order_value}}
- Messages should feel personal and human, NOT robotic
- Use Indian English naturally (e.g., "lakhs", "rupees", "₹")
- The Call to Action (CTA) MUST be crystal clear and create urgency.
- recommendedVariantLabel: which variant you think will perform best for this segment and why
- strategyNote: 1-2 sentence strategic note about the campaign approach

Return ONLY valid JSON matching the schema.`;

  return generateStructured<CampaignVariantsResult>(prompt, VARIANTS_SCHEMA);
}
