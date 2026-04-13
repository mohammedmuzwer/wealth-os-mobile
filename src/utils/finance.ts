/**
 * finance.ts
 * Core financial logic for Wealth OS — React Native
 * Ported from utils.js with clean TypeScript rewrite.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExpenseCategory =
  | 'petrol'
  | 'food'
  | 'shopping'
  | 'family'
  | 'friends'
  | 'medical'
  | 'other';

export type SpendingType = 'fixed' | 'variable';

export interface ExpenseRule {
  icon: string;
  name: string;
  preset: number;
  weeklyLimit: number;
  cooldownDays: number;
  softWarn: boolean;
  type: SpendingType;
}

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  note?: string;
  date: string; // ISO string
  /**
   * PRD: Fixed expenses NEVER count against the Shield ring daily budget.
   * Defaults to the category rule's `type === 'fixed'` when not explicitly set.
   */
  is_fixed?: boolean;
}

export interface FinancialInput {
  income: number;
  expenses: number;
  savings: number;
  investments: number;
  loans: number;
  insurance: number;
}

export interface RingMetrics {
  /** Outer — Red: daily spend vs 10% of daily income */
  shieldPct: number;
  /** Middle — Blue: 100% minus expense ratio */
  trackPct: number;
  /** Inner — Green: savings rate × 2, capped at 100 */
  buildPct: number;
  wealthScore: number;
}

/** PRD spec 5-tier score labels (Section 00 — Scoring Engine). */
export type ScoreTier = 'AT RISK' | 'STABLE' | 'GROWING' | 'STRONG' | 'ELITE';

export interface FinancialSummary extends FinancialInput, RingMetrics {
  netWealth: number;
  savingsRate: number;
  expenseRatio: number;
  loanRatio: number;
  dailyIncomeTarget: number;
  macroScore: number;   // max 60 — Protection + Wealth + Debt
  microScore: number;   // max 40 — Shield + Track + Build rings
  scoreTier: ScoreTier;
}

export interface FixedVsVariableResult {
  fixed: number;
  variable: number;
  fixedPct: number;
  variablePct: number;
  breakdown: Record<ExpenseCategory, number>;
}

export interface Insight {
  category: string;
  message: string;
  status: 'success' | 'warn' | 'danger';
  icon: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const GOAL_TARGET = 15_000_000; // ₹1.5 Cr

/**
 * Expense rules with Fixed vs Variable classification.
 *
 * Fixed   → predictable, non-discretionary (medical, family obligations)
 * Variable → discretionary or irregular (food, petrol, shopping, etc.)
 */
export const EXPENSE_RULES: Record<ExpenseCategory, ExpenseRule> = {
  petrol:   { icon: '⛽', name: 'Petrol',   preset: 500,  weeklyLimit: 3000, cooldownDays: 3, softWarn: true,  type: 'variable' },
  food:     { icon: '🍔', name: 'Food',     preset: 200,  weeklyLimit: 2000, cooldownDays: 0, softWarn: false, type: 'variable' },
  shopping: { icon: '🛒', name: 'Shopping', preset: 500,  weeklyLimit: 3000, cooldownDays: 5, softWarn: true,  type: 'variable' },
  family:   { icon: '👨‍👩‍👧', name: 'Family',  preset: 1000, weeklyLimit: 5000, cooldownDays: 0, softWarn: false, type: 'fixed'    },
  friends:  { icon: '🍻', name: 'Friends',  preset: 500,  weeklyLimit: 2000, cooldownDays: 0, softWarn: false, type: 'variable' },
  medical:  { icon: '💊', name: 'Medical',  preset: 500,  weeklyLimit: 0,    cooldownDays: 0, softWarn: false, type: 'fixed'    },
  other:    { icon: '📦', name: 'Other',    preset: 300,  weeklyLimit: 2000, cooldownDays: 0, softWarn: false, type: 'variable' },
};

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Format a rupee amount with Cr/L/K shorthand. */
export const fmt = (n: number): string => {
  if (n === 0) return '₹0';
  if (!n || isNaN(n)) return '—';
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
};

/** Format a gold weight in grams. */
export const fmtGrams = (n: number): string => `${(n ?? 0).toFixed(3)}g`;

/** Format a ratio as a percentage string (0.123 → "12%"). */
export const fmtPct = (n: number): string => `${Math.round((n ?? 0) * 100)}%`;

/** Returns 'positive' or 'negative' colour key for a value. */
export const colorKey = (n: number): 'positive' | 'negative' => (n >= 0 ? 'positive' : 'negative');

// ─── Fixed vs Variable Spending ───────────────────────────────────────────────

/**
 * Splits an expense list into Fixed and Variable buckets.
 *
 * Fixed  → family, medical
 * Variable → petrol, food, shopping, friends, other
 *
 * Returns totals, percentages, and a per-category breakdown.
 */
export const splitFixedVariable = (expenses: Expense[]): FixedVsVariableResult => {
  const breakdown = {} as Record<ExpenseCategory, number>;

  // Initialise all categories to 0
  (Object.keys(EXPENSE_RULES) as ExpenseCategory[]).forEach((cat) => {
    breakdown[cat] = 0;
  });

  let fixed = 0;
  let variable = 0;

  for (const exp of expenses) {
    const cat = exp.category as ExpenseCategory;
    if (!(cat in breakdown)) continue;
    breakdown[cat] += exp.amount;
    // is_fixed overrides category rule; falls back to rule type
    const isFixed = exp.is_fixed !== undefined
      ? exp.is_fixed
      : EXPENSE_RULES[cat].type === 'fixed';
    if (isFixed) {
      fixed += exp.amount;
    } else {
      variable += exp.amount;
    }
  }

  const total = fixed + variable || 1; // avoid div-by-zero

  return {
    fixed,
    variable,
    fixedPct: Math.round((fixed / total) * 100),
    variablePct: Math.round((variable / total) * 100),
    breakdown,
  };
};

// ─── Cooldown Logic ───────────────────────────────────────────────────────────

/**
 * Returns the number of cooldown days remaining for a category,
 * based on the most recent expense of that type.
 *
 * Returns 0 if no cooldown applies or cooldown has passed.
 */
export const getCooldownLeft = (
  category: ExpenseCategory,
  expenses: Expense[],
): number => {
  const rule = EXPENSE_RULES[category];
  if (!rule || rule.cooldownDays === 0) return 0;

  const last = expenses
    .filter((e) => e.category === category)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  if (!last) return 0;

  const daysSince = (Date.now() - new Date(last.date).getTime()) / 864e5;
  const remaining = rule.cooldownDays - daysSince;
  return remaining > 0 ? Math.ceil(remaining) : 0;
};

/**
 * Returns the total spend for a category in the past 7 days.
 */
export const getWeeklySpend = (category: ExpenseCategory, expenses: Expense[]): number => {
  const cutoff = Date.now() - 7 * 864e5;
  return expenses
    .filter((e) => e.category === category && new Date(e.date).getTime() >= cutoff)
    .reduce((sum, e) => sum + e.amount, 0);
};

/**
 * Returns any active spending warnings for a category.
 */
export const getSpendingWarnings = (
  category: ExpenseCategory,
  expenses: Expense[],
): string[] => {
  const rule = EXPENSE_RULES[category];
  const warnings: string[] = [];

  const cooldown = getCooldownLeft(category, expenses);
  if (cooldown > 0) {
    warnings.push(`${rule.name} is on cooldown for ${cooldown} more day${cooldown > 1 ? 's' : ''}.`);
  }

  if (rule.weeklyLimit > 0) {
    const weekSpend = getWeeklySpend(category, expenses);
    if (weekSpend >= rule.weeklyLimit) {
      warnings.push(`Weekly ${rule.name} limit of ${fmt(rule.weeklyLimit)} reached (${fmt(weekSpend)} spent).`);
    } else if (rule.softWarn && weekSpend >= rule.weeklyLimit * 0.8) {
      warnings.push(`${rule.name} at ${Math.round((weekSpend / rule.weeklyLimit) * 100)}% of weekly limit.`);
    }
  }

  return warnings;
};

// ─── Macro Score (60 pts) ─────────────────────────────────────────────────────

/**
 * Protection score (max 15 pts).
 * PRD: Insurance Raw Score (out of 20) × 0.75
 * Derived from insurance premium as % of monthly income.
 */
const calcProtectionScore = (insurance: number, income: number): number => {
  if (income <= 0 || insurance <= 0) return 0;
  const ratio = insurance / income;
  if (ratio >= 0.03)  return 15;  // Term Life + Health both active  (raw 20 × 0.75)
  if (ratio >= 0.015) return 9;   // Health only                      (raw 12 × 0.75)
  if (ratio >= 0.005) return 7.5; // Term life only                   (raw 10 × 0.75)
  return 0;
};

/**
 * Wealth score (max 25 pts).
 * PRD: Savings Rate = Recurring Investments / Monthly Income
 * Rookie <10%: 5 pts · Good 10-19%: 15 pts · Elite 20%+: 25 pts
 */
const calcWealthScore = (investments: number, income: number): number => {
  if (income <= 0) return 0;
  const rate = investments / income;
  if (rate >= 0.20) return 25;
  if (rate >= 0.10) return 15;
  if (rate >= 0.01) return 5;
  return 0;
};

/**
 * Debt score (max 20 pts).
 * PRD: DTI ratio tiers.
 * <20%: 20 · 20-30%: 15 · 30-40%: 8 · 40-50%: 2 · >50%: 0
 */
const calcDebtScore = (loans: number, income: number): number => {
  if (income <= 0 || loans <= 0) return 20;
  const dti = loans / income;
  if (dti < 0.20) return 20;
  if (dti < 0.30) return 15;
  if (dti < 0.40) return 8;
  if (dti < 0.50) return 2;
  return 0;
};

/**
 * Full Macro Base Score (max 60 pts).
 * Resets on the 1st of each month.
 */
export const calcMacroScore = (input: FinancialInput): number => {
  const protection = calcProtectionScore(input.insurance, input.income);
  const wealth     = calcWealthScore(input.investments, input.income);
  const debt       = calcDebtScore(input.loans, input.income);
  return Math.round(protection + wealth + debt);
};

// ─── Ring Metrics ─────────────────────────────────────────────────────────────

/**
 * Calculates all three ring FILL PERCENTAGES and the composite wealth score.
 *
 * Shield (Outer/Red)   → daily variable spend ÷ daily budget (10% income ÷ 30)
 *                        Can exceed 100% (over-spend shown as ring lap).
 * Track  (Middle/Blue) → 1 − monthly expense ratio, capped to [0, 200%].
 *                        Can exceed 100% (excellent control).
 * Build  (Inner/Green) → savings rate × 2. Hard-capped at 100% by PRD spec.
 *
 * wealthScore = macroScore (max 60) + microScore (max 40), capped at 100.
 */
export const calculateRings = (input: FinancialInput, dailyVariableSpend = 0): RingMetrics => {
  const { income, expenses, savings, investments, loans, insurance } = input;

  // ── Ring fill percentages ──────────────────────────────────────────────────

  const dailyLimit = income > 0 ? (income * 0.1) / 30 : 0;
  // Shield fills as you spend; >100% = over daily limit (ring wraps)
  const shieldPct = dailyLimit > 0
    ? Math.round((dailyVariableSpend / dailyLimit) * 100)
    : 0;

  // Track fills as you control monthly expenses; >100% = excellent (ratio < 0%)
  const expenseRatio = income > 0 ? expenses / income : 0;
  const trackPct = Math.min(200, Math.round(Math.max(0, 1 - expenseRatio) * 100));

  // Build hard-capped at 100% by PRD spec
  const savingsRate = income > 0 ? savings / income : 0;
  const buildPct = Math.round(Math.min(1, savingsRate * 2) * 100);

  // ── Micro daily score (max 40 pts) ────────────────────────────────────────
  // Shield: inversely proportional to spend. 0% spend = 20pts, 100% = 0pts.
  // Over-completion bonus: +5 pts per additional 100% on Shield (capped at 0 floor).
  const shieldMicro = Math.max(0, 20 - (shieldPct / 100) * 20);

  // Track: proportional to fill (10pts at 100%, bonus +5 per extra 100%)
  const trackBase  = Math.min(trackPct, 100) / 100 * 10;
  const trackBonus = Math.max(0, Math.floor((trackPct - 100) / 100)) * 5;
  const trackMicro = trackBase + trackBonus;

  // Build: hard-capped at 10pts (no over-completion bonus)
  const buildMicro = Math.min(buildPct, 100) / 100 * 10;

  const microScore = Math.min(40, Math.round(shieldMicro + trackMicro + buildMicro));
  const macroScore = calcMacroScore(input);
  const wealthScore = Math.min(100, macroScore + microScore);

  return {
    shieldPct,
    trackPct,
    buildPct,
    wealthScore,
  };
};

// ─── Full Summary ─────────────────────────────────────────────────────────────

/**
 * Computes the complete financial summary used by the dashboard.
 * PRD: Day 1 Grace — Base Score hardcoded 30/60 for first 7 days.
 */
export const calculateFinancials = (
  input: FinancialInput,
  dailyVariableSpend = 0,
  daysActive = 99,
): FinancialSummary => {
  const { income, expenses, savings, investments, loans } = input;

  const netWealth    = investments + savings - loans;
  const savingsRate  = income > 0 ? Math.round((savings  / income) * 100) : 0;
  const expenseRatio = income > 0 ? Math.round((expenses / income) * 100) : 0;
  const loanRatio    = income > 0 ? Math.round((loans    / income) * 100) : 0;
  const dailyIncomeTarget = income > 0 ? Math.round((income * 0.1) / 30) : 0;

  const rings      = calculateRings(input, dailyVariableSpend);
  const macroScore = calcMacroScore(input);
  const microScore = rings.wealthScore - macroScore;

  // Day 1 Grace: hardcode macro contribution to 30 for first 7 days
  const effectiveMacro = daysActive <= 7 ? 30 : macroScore;
  const wealthScore = Math.min(100, effectiveMacro + Math.max(0, microScore));

  // PRD 5-tier label
  const scoreTier: ScoreTier =
    wealthScore >= 95 ? 'ELITE'   :
    wealthScore >= 85 ? 'STRONG'  :
    wealthScore >= 75 ? 'GROWING' :
    wealthScore >= 60 ? 'STABLE'  : 'AT RISK';

  return {
    ...input,
    ...rings,
    wealthScore,
    netWealth,
    savingsRate,
    expenseRatio,
    loanRatio,
    dailyIncomeTarget,
    macroScore: effectiveMacro,
    microScore: Math.max(0, microScore),
    scoreTier,
  };
};

// ─── Insights ─────────────────────────────────────────────────────────────────

export const generateInsights = (summary: FinancialSummary): Insight[] => {
  const insights: Insight[] = [];

  // Savings
  if (summary.savingsRate > 25) {
    insights.push({ category: 'Savings', message: 'Strong savings discipline', status: 'success', icon: '📈' });
  } else if (summary.savingsRate > 10) {
    insights.push({ category: 'Savings', message: 'Fair savings rate', status: 'warn', icon: '📊' });
  } else {
    insights.push({ category: 'Savings', message: 'Savings rate is below target', status: 'danger', icon: '⚠️' });
  }

  // Loans
  if (summary.loanRatio > 50) {
    insights.push({ category: 'Loans', message: 'Critical loan burden', status: 'danger', icon: '🛡️' });
  } else if (summary.loanRatio > 30) {
    insights.push({ category: 'Loans', message: 'Manageable debt levels', status: 'warn', icon: '⚖️' });
  } else {
    insights.push({ category: 'Loans', message: 'Healthy debt-to-income ratio', status: 'success', icon: '✅' });
  }

  // Daily shield
  if (summary.shieldPct > 100) {
    insights.push({ category: 'Daily', message: 'Exceeded 10% daily income limit', status: 'danger', icon: '🚨' });
  } else if (summary.shieldPct > 80) {
    insights.push({ category: 'Daily', message: 'Approaching daily limit', status: 'warn', icon: '⚡' });
  } else {
    insights.push({ category: 'Daily', message: 'Daily spend within shield limit', status: 'success', icon: '🛡️' });
  }

  return insights;
};

// ─── SIP Simulator ────────────────────────────────────────────────────────────

/**
 * Calculates the maturity value of a monthly SIP.
 * @param monthly  Monthly investment (₹)
 * @param years    Investment horizon
 * @param rate     Annual return rate (default 12%)
 */
export const simulateSIP = (monthly: number, years: number, rate = 12): number => {
  const r = rate / 100 / 12;
  const n = years * 12;
  return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
};

// ─── Date Helpers ─────────────────────────────────────────────────────────────

export const getDayOfYear = (): number => {
  const now = new Date();
  return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 864e5);
};

export const isToday = (dateStr: string): boolean => {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate()
  );
};
