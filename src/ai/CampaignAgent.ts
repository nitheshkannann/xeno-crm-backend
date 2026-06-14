import { generateStructured } from './GeminiClient.js';
import { prisma } from '../lib/prisma.js';
import { getMemoryContext } from './SegmentBuilder.js';
import type { AIAgentResult, AIAgentStep, AIExplainability, FilterGroup, Channel } from '@xeno/types';

interface AgentContext {
  goal: string;
  onStep?: (step: AIAgentStep) => void;
}

const AGENT_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    analysis: {
      type: 'object',
      properties: {
        insight: { type: 'string' },
        targetCohort: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['insight', 'targetCohort', 'rationale'],
    },
    segment: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        filterRules: {
          type: 'object',
          properties: {
            logic: { type: 'string' },
            rules: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  operator: { type: 'string' },
                  value: { type: 'string' },
                },
                required: ['field', 'operator', 'value'],
              },
            },
          },
          required: ['logic', 'rules'],
        },
      },
      required: ['name', 'description', 'filterRules'],
    },
    campaign: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        objective: { type: 'string' },
        channel: { type: 'string', enum: ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH'] },
        channelReason: { type: 'string' },
      },
      required: ['name', 'objective', 'channel', 'channelReason'],
    },
    explainability: {
      type: 'object',
      properties: {
        recommendation: { type: 'string' },
        confidence: { type: 'number' },
        reasoning: { type: 'array', items: { type: 'string' } },
        alternatives: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              segment: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['segment', 'reason'],
          },
        },
      },
      required: ['recommendation', 'confidence', 'reasoning', 'alternatives'],
    },
  },
  required: ['analysis', 'segment', 'campaign', 'explainability'],
};

/**
 * AI Campaign Agent: multi-step agentic workflow.
 * Takes a high-level goal, analyzes data, builds segment, selects channel,
 * and returns a complete campaign draft with explainability.
 */
export async function runCampaignAgent(ctx: AgentContext): Promise<AIAgentResult> {
  const steps: AIAgentStep[] = [];
  const emit = (step: AIAgentStep) => {
    steps.push(step);
    ctx.onStep?.(step);
  };

  try {
    // Step 1: Analyze customer base
    emit({ step: 'analyze', status: 'running', message: 'Analyzing your customer base...' });
    const [totalCustomers, healthDist, topCities, recentCampaigns] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.groupBy({
        by: ['healthLabel'],
        _count: { id: true },
      }),
      prisma.customer.groupBy({
        by: ['city'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      prisma.campaign.findMany({
        where: { status: 'COMPLETED' },
        include: { insights: true },
        orderBy: { completedAt: 'desc' },
        take: 3,
      }),
    ]);

    const healthSummary = healthDist.map(h => `${h.healthLabel}: ${h._count.id}`).join(', ');
    const citySummary = topCities.map(c => `${c.city}: ${c._count.id}`).join(', ');
    const atRisk = healthDist.find(h => h.healthLabel === 'AT_RISK')?._count.id || 0;
    const churnRisk = healthDist.find(h => h.healthLabel === 'CHURN_RISK')?._count.id || 0;

    emit({ step: 'analyze', status: 'done', message: `Found ${totalCustomers} customers. ${atRisk} at risk, ${churnRisk} churn risk.`, data: { totalCustomers, healthSummary, citySummary } });

    // Step 2: Get memory context
    emit({ step: 'memory', status: 'running', message: 'Checking past campaign performance...' });
    const memoryContext = await getMemoryContext();
    emit({ step: 'memory', status: 'done', message: memoryContext ? 'Found relevant historical data.' : 'No previous campaigns yet.', data: { memoryContext } });

    // Step 3: AI plans the entire campaign
    emit({ step: 'plan', status: 'running', message: 'AI is building your campaign strategy...' });

    const agentPrompt = `You are an expert marketing strategist for an Indian e-commerce brand.

USER GOAL: "${ctx.goal}"

CUSTOMER BASE DATA:
- Total customers: ${totalCustomers}
- Health distribution: ${healthSummary}
- Top cities: ${citySummary}
- At-risk customers: ${atRisk}
- Churn-risk customers: ${churnRisk}

${memoryContext ? `HISTORICAL CAMPAIGN PERFORMANCE (use this to inform your recommendation):\n${memoryContext}` : 'No historical campaigns yet.'}

RECENT CAMPAIGNS:
${recentCampaigns.map(c => `- "${c.name}" (${c.channel}): ${c.status}`).join('\n') || 'None yet'}

AVAILABLE SEGMENT FIELDS:
daysSinceLastOrder, totalSpend, orderCount, avgOrderValue, city, state, gender,
preferredCategory, emailOpenRate, emailClickRate, healthScore, healthLabel, tags

YOUR TASK:
1. Analyze the data and identify the best customer cohort to target
2. Design a precise segment using filter rules
3. Choose the optimal channel based on historical data (or best practice if no history)
4. Provide clear explainability for WHY you made these choices
5. Confidence score: 0.0-1.0 based on available evidence

IMPORTANT: All filter values must be strings (e.g., "30", "5000", "AT_RISK").
Return complete JSON matching the schema exactly.`;

    const agentPlan = await generateStructured<{
      analysis: { insight: string; targetCohort: string; rationale: string };
      segment: { name: string; description: string; filterRules: FilterGroup };
      campaign: { name: string; objective: string; channel: Channel; channelReason: string };
      explainability: AIExplainability;
    }>(agentPrompt, AGENT_PLAN_SCHEMA);

    emit({ step: 'plan', status: 'done', message: `Strategy: ${agentPlan.analysis.targetCohort}`, data: agentPlan.analysis });

    // Step 4: Compute segment preview
    emit({ step: 'segment', status: 'running', message: `Building segment: "${agentPlan.segment.name}"...` });
    const { SegmentEngine } = await import('../services/SegmentEngine.js');
    const segmentPreview = await SegmentEngine.preview(agentPlan.segment.filterRules);
    emit({ step: 'segment', status: 'done', message: `Segment ready: ${segmentPreview.count} customers matched.`, data: { count: segmentPreview.count, sample: segmentPreview.sample } });

    // Step 5: Generate message variants
    emit({ step: 'message', status: 'running', message: 'Writing personalized message variants...' });
    const { generateCampaignVariants } = await import('./CampaignWriter.js');
    const variantsResult = await generateCampaignVariants({
      objective: agentPlan.campaign.objective,
      channel: agentPlan.campaign.channel,
      segmentDescription: agentPlan.segment.description,
      segmentSize: segmentPreview.count,
    });
    emit({ step: 'message', status: 'done', message: `Generated ${variantsResult.variants.length} message variants. Recommended: ${variantsResult.recommendedVariantLabel}`, data: variantsResult });

    // Step 6: Assemble draft
    emit({ step: 'draft', status: 'done', message: `Campaign draft ready: "${agentPlan.campaign.name}" via ${agentPlan.campaign.channel}` });

    const explainability: AIExplainability = {
      ...agentPlan.explainability,
      evidence: {
        audienceSize: segmentPreview.count,
        channel: agentPlan.campaign.channel,
        channelReason: agentPlan.campaign.channelReason,
        historicalContext: memoryContext ? 'Based on past campaign data' : 'Based on best practices',
        customerHealthDistribution: healthSummary,
      },
    };

    return {
      steps,
      segmentId: undefined, // Will be set after human approval
      campaignDraft: {
        name: agentPlan.campaign.name,
        description: agentPlan.analysis.rationale,
        segmentId: '', // Placeholder — set on approval
        channel: agentPlan.campaign.channel,
        status: 'DRAFT',
        isAutoGenerated: true,
        segment: {
          id: '',
          name: agentPlan.segment.name,
          customerCount: segmentPreview.count,
        },
        variants: variantsResult.variants,
        filterRules: agentPlan.segment.filterRules,
        segmentName: agentPlan.segment.name,
        segmentDescription: agentPlan.segment.description,
      } as never,
      explainability,
    };
  } catch (err) {
    emit({ step: 'error', status: 'error', message: `Agent error: ${(err as Error).message}` });
    throw err;
  }
}
