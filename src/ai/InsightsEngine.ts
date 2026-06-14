import { generateStructured } from './GeminiClient.js';
import { prisma } from '../lib/prisma.js';

interface InsightsInput {
  campaignId: string;
}

interface InsightsResult {
  summary: string;
  insights: string[];
  recommendations: string[];
  variantAnalysis: { label: string; finding: string }[];
}

const INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    insights: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
    variantAnalysis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          finding: { type: 'string' },
        },
        required: ['label', 'finding'],
      },
    },
  },
  required: ['summary', 'insights', 'recommendations', 'variantAnalysis'],
};

export async function generateCampaignInsights(input: InsightsInput): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
    include: {
      segment: true,
      variants: true,
      logs: {
        include: { events: true, variant: true },
      },
    },
  });

  if (!campaign) throw new Error('Campaign not found');

  // Compute metrics
  const totalLogs = campaign.logs.length;
  if (totalLogs === 0) return;

  const eventCounts: Record<string, number> = {};
  for (const log of campaign.logs) {
    for (const event of log.events) {
      eventCounts[event.eventType] = (eventCounts[event.eventType] || 0) + 1;
    }
  }

  const delivered = eventCounts['DELIVERED'] || 0;
  const opened = eventCounts['OPENED'] || 0;
  const clicked = eventCounts['CLICKED'] || 0;
  const converted = eventCounts['CONVERTED'] || 0;

  const metrics = {
    total: totalLogs,
    delivered,
    opened,
    clicked,
    converted,
    failed: eventCounts['FAILED'] || 0,
    deliveryRate: totalLogs > 0 ? delivered / totalLogs : 0,
    openRate: delivered > 0 ? opened / delivered : 0,
    clickRate: opened > 0 ? clicked / opened : 0,
    conversionRate: clicked > 0 ? converted / clicked : 0,
  };

  // Per-variant breakdown
  const variantStats: Record<string, { label: string; total: number; opened: number; clicked: number; converted: number }> = {};
  for (const log of campaign.logs) {
    if (!log.variant) continue;
    const v = log.variant;
    if (!variantStats[v.id]) variantStats[v.id] = { label: v.label, total: 0, opened: 0, clicked: 0, converted: 0 };
    variantStats[v.id].total++;
    for (const event of log.events) {
      if (event.eventType === 'OPENED') variantStats[v.id].opened++;
      if (event.eventType === 'CLICKED') variantStats[v.id].clicked++;
      if (event.eventType === 'CONVERTED') variantStats[v.id].converted++;
    }
  }

  const variantSummary = Object.values(variantStats).map(v =>
    `Variant "${v.label}": ${v.total} sent, open rate ${v.total > 0 ? ((v.opened / v.total) * 100).toFixed(1) : 0}%, click rate ${v.total > 0 ? ((v.clicked / v.total) * 100).toFixed(1) : 0}%, conversion rate ${v.total > 0 ? ((v.converted / v.total) * 100).toFixed(1) : 0}%`,
  ).join('\n');

  // Generate AI insights
  const prompt = `You are a marketing analytics expert reviewing campaign performance data.

Campaign: "${campaign.name}"
Segment: "${campaign.segment.name}" (${campaign.segment.customerCount} customers)
Channel: ${campaign.channel}

PERFORMANCE METRICS:
- Total audience: ${metrics.total}
- Delivered: ${metrics.delivered} (${(metrics.deliveryRate * 100).toFixed(1)}%)
- Opened: ${metrics.opened} (${(metrics.openRate * 100).toFixed(1)}% open rate)
- Clicked: ${metrics.clicked} (${(metrics.clickRate * 100).toFixed(1)}% click rate)
- Converted: ${metrics.converted} (${(metrics.conversionRate * 100).toFixed(1)}% conversion rate)

VARIANT PERFORMANCE:
${variantSummary || 'No variant data available'}

INDUSTRY BENCHMARKS (Indian e-commerce):
- Email open rate: 18-25%
- Click rate: 2-5%
- Conversion rate: 2-4%

Generate:
1. A concise executive summary (2-3 sentences)
2. 3-5 specific insights from the data (use exact numbers)
3. 3-4 concrete recommendations for next campaigns (actionable)
4. Analysis of each variant's performance

Be specific, data-driven, and actionable. Mention if performance is above/below industry benchmarks.`;

  const insightsResult = await generateStructured<InsightsResult>(prompt, INSIGHTS_SCHEMA);

  // Save insights to DB
  await prisma.aIInsight.create({
    data: {
      campaignId: campaign.id,
      summary: insightsResult.summary,
      insights: insightsResult.insights,
      recommendations: insightsResult.recommendations,
      metrics: metrics as never,
    },
  });

  // Compile a dense textual representation of the campaign for the embedding
  const memoryText = `
Campaign Name: ${campaign.name}
Segment: ${campaign.segment.name}
Channel: ${campaign.channel}
Audience Size: ${metrics.total}
Open Rate: ${(metrics.openRate * 100).toFixed(1)}%
Click Rate: ${(metrics.clickRate * 100).toFixed(1)}%
Conversion Rate: ${(metrics.conversionRate * 100).toFixed(1)}%
Revenue Generated: ₹${metrics.converted * 1500}
Summary: ${insightsResult.summary}
Insights: ${insightsResult.insights.join('; ')}
Recommendations: ${insightsResult.recommendations.join('; ')}
  `.trim();

  const embedding = await import('./GeminiClient.js').then(m => m.generateEmbedding(memoryText));
  const performanceLabel = metrics.conversionRate > 0.12 ? 'high' : metrics.conversionRate > 0.06 ? 'medium' : 'low';

  // Save to marketing memory using raw SQL to support pgvector insertion
  await prisma.$executeRaw`
    INSERT INTO marketing_memory (
      "id", "campaignId", "segmentDescription", "segmentCriteria", "channel", 
      "audienceSize", "openRate", "clickRate", "conversionRate", "revenueGenerated", 
      "performanceLabel", "notes", "embedding", "createdAt"
    ) VALUES (
      gen_random_uuid()::text,
      ${campaign.id},
      ${campaign.segment.name},
      ${JSON.stringify(campaign.segment.filterRules)}::jsonb,
      CAST(${campaign.channel} AS "Channel"),
      ${metrics.total},
      ${metrics.openRate},
      ${metrics.clickRate},
      ${metrics.conversionRate},
      ${metrics.converted * 1500},
      ${performanceLabel},
      ${insightsResult.summary},
      ${`[${embedding.join(',')}]`}::vector,
      NOW()
    )
  `;
}
