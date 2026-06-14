import { Prisma } from '@prisma/client';
import type { FilterGroup, FilterRule } from '@xeno/types';
import { prisma } from '../lib/prisma.js';

/**
 * SegmentEngine: Translates structured filter JSON into Prisma WHERE clauses.
 * Zero raw SQL. All filtering done through Prisma's type-safe query builder.
 *
 * Supported fields and their Prisma mappings:
 * - daysSinceLastOrder   → daysSinceLastOrder (Int)
 * - totalSpend           → totalSpend (Float)
 * - orderCount           → orderCount (Int)
 * - avgOrderValue        → avgOrderValue (Float)
 * - city                 → city (String)
 * - state                → state (String)
 * - gender               → gender (Enum)
 * - preferredCategory    → preferredCategory (String)
 * - emailOpenRate        → emailOpenRate (Float, 0-1)
 * - emailClickRate       → emailClickRate (Float, 0-1)
 * - healthScore          → healthScore (Int, 0-100)
 * - healthLabel          → healthLabel (Enum)
 * - tags                 → tags (String[])
 */

type CustomerWhereInput = Prisma.CustomerWhereInput;

function buildCondition(rule: FilterRule): CustomerWhereInput {
  const { field, value } = rule;
  const operator = String(rule.operator).toLowerCase();

  const numVal = typeof value === 'number' ? value : Number(value);
  const strVal = String(value);
  const arrVal = Array.isArray(value) ? value.map(String) : [strVal];

  const fieldMap: Record<string, () => CustomerWhereInput> = {
    daysSinceLastOrder: () => {
      switch (operator) {
        case 'eq':
        case 'equals': return { daysSinceLastOrder: numVal };
        case 'neq': return { NOT: { daysSinceLastOrder: numVal } };
        case 'gt': return { daysSinceLastOrder: { gt: numVal } };
        case 'gte': return { daysSinceLastOrder: { gte: numVal } };
        case 'lt': return { daysSinceLastOrder: { lt: numVal } };
        case 'lte': return { daysSinceLastOrder: { lte: numVal } };
        default: return {};
      }
    },
    totalSpend: () => {
      switch (operator) {
        case 'eq':
        case 'equals': return { totalSpend: numVal };
        case 'gt': return { totalSpend: { gt: numVal } };
        case 'gte': return { totalSpend: { gte: numVal } };
        case 'lt': return { totalSpend: { lt: numVal } };
        case 'lte': return { totalSpend: { lte: numVal } };
        default: return {};
      }
    },
    orderCount: () => {
      switch (operator) {
        case 'eq':
        case 'equals': return { orderCount: numVal };
        case 'gt': return { orderCount: { gt: numVal } };
        case 'gte': return { orderCount: { gte: numVal } };
        case 'lt': return { orderCount: { lt: numVal } };
        case 'lte': return { orderCount: { lte: numVal } };
        default: return {};
      }
    },
    avgOrderValue: () => {
      switch (operator) {
        case 'gt': return { avgOrderValue: { gt: numVal } };
        case 'gte': return { avgOrderValue: { gte: numVal } };
        case 'lt': return { avgOrderValue: { lt: numVal } };
        case 'lte': return { avgOrderValue: { lte: numVal } };
        default: return {};
      }
    },
    emailOpenRate: () => {
      // Convert percentage to decimal if needed
      const rate = numVal > 1 ? numVal / 100 : numVal;
      switch (operator) {
        case 'gt': return { emailOpenRate: { gt: rate } };
        case 'gte': return { emailOpenRate: { gte: rate } };
        case 'lt': return { emailOpenRate: { lt: rate } };
        case 'lte': return { emailOpenRate: { lte: rate } };
        default: return {};
      }
    },
    emailClickRate: () => {
      const rate = numVal > 1 ? numVal / 100 : numVal;
      switch (operator) {
        case 'gt': return { emailClickRate: { gt: rate } };
        case 'gte': return { emailClickRate: { gte: rate } };
        case 'lt': return { emailClickRate: { lt: rate } };
        case 'lte': return { emailClickRate: { lte: rate } };
        default: return {};
      }
    },
    healthScore: () => {
      switch (operator) {
        case 'eq':
        case 'equals': return { healthScore: numVal };
        case 'gt': return { healthScore: { gt: numVal } };
        case 'gte': return { healthScore: { gte: numVal } };
        case 'lt': return { healthScore: { lt: numVal } };
        case 'lte': return { healthScore: { lte: numVal } };
        default: return {};
      }
    },
    healthLabel: () => {
      switch (operator) {
        case 'eq':
        case 'equals': return { healthLabel: strVal as never };
        case 'neq': return { NOT: { healthLabel: strVal as never } };
        case 'in': return { healthLabel: { in: arrVal as never[] } };
        case 'not_in': return { NOT: { healthLabel: { in: arrVal as never[] } } };
        default: return {};
      }
    },
    city: () => {
      switch (operator) {
        case 'eq':
        case 'equals': return { city: { equals: strVal, mode: 'insensitive' } };
        case 'neq': return { NOT: { city: { equals: strVal, mode: 'insensitive' } } };
        case 'in': return { city: { in: arrVal, mode: 'insensitive' } };
        case 'not_in': return { NOT: { city: { in: arrVal, mode: 'insensitive' } } };
        case 'contains': return { city: { contains: strVal, mode: 'insensitive' } };
        default: return {};
      }
    },
    state: () => {
      switch (operator) {
        case 'eq':
        case 'equals': return { state: { equals: strVal, mode: 'insensitive' } };
        case 'in': return { state: { in: arrVal, mode: 'insensitive' } };
        default: return {};
      }
    },
    gender: () => {
      switch (operator) {
        case 'eq':
        case 'equals': return { gender: strVal.toUpperCase() as never };
        case 'neq': return { NOT: { gender: strVal.toUpperCase() as never } };
        default: return {};
      }
    },
    preferredCategory: () => {
      switch (operator) {
        case 'eq':
        case 'equals': return { preferredCategory: { equals: strVal, mode: 'insensitive' } };
        case 'in': return { preferredCategory: { in: arrVal, mode: 'insensitive' } };
        case 'neq': return { NOT: { preferredCategory: { equals: strVal, mode: 'insensitive' } } };
        default: return {};
      }
    },
    tags: () => {
      switch (operator) {
        case 'has': return { tags: { has: strVal } };
        case 'not_in': return { NOT: { tags: { has: strVal } } };
        default: return {};
      }
    },
  };

  const builder = fieldMap[field];
  if (!builder) {
    console.warn(`[SegmentEngine] Unknown field: ${field}`);
    return {};
  }
  return builder();
}

function buildWhereClause(group: FilterGroup): CustomerWhereInput {
  const conditions = group.rules.map((rule) => {
    // Nested group
    if ('rules' in rule) {
      return buildWhereClause(rule as FilterGroup);
    }
    return buildCondition(rule as FilterRule);
  });

  if (conditions.length === 0) return {};

  switch (group.logic) {
    case 'AND': return { AND: conditions };
    case 'OR': return { OR: conditions };
    case 'NOT': return { NOT: { AND: conditions } };
    default: return { AND: conditions };
  }
}

export const SegmentEngine = {
  /**
   * Compute customers matching a segment's filter rules.
   * Returns full customer list (used for campaign dispatch).
   */
  async compute(filterRules: FilterGroup) {
    const where = buildWhereClause(filterRules);
    return prisma.customer.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        healthScore: true,
        healthLabel: true,
        totalSpend: true,
        avgOrderValue: true,
        lastOrderDate: true,
        preferredCategory: true,
        emailOpenRate: true,
      },
      orderBy: { healthScore: 'desc' },
    });
  },

  /**
   * Preview — count + sample of 5 customers.
   * Used for real-time segment builder feedback.
   */
  async preview(filterRules: FilterGroup) {
    const where = buildWhereClause(filterRules);
    const [count, sample] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          healthScore: true,
          healthLabel: true,
        },
        take: 5,
        orderBy: { healthScore: 'desc' },
      }),
    ]);
    return { count, sample };
  },

  /**
   * Build a Prisma WHERE clause from filter rules (for advanced use).
   */
  buildWhere(filterRules: FilterGroup): CustomerWhereInput {
    return buildWhereClause(filterRules);
  },
};
