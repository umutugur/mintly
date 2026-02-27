import type { CategoryKey, TemplateBank } from './types.js';

function combine(first: readonly string[], second: readonly string[]): string[] {
  const out: string[] = [];
  for (const a of first) {
    for (const b of second) {
      out.push(`${a} ${b}`.replace(/\s+/g, ' ').trim());
    }
  }
  return out;
}

const enAdviceSummaries: Record<CategoryKey, string[]> = {
  spending: combine(
    [
      'In {monthName}, spending momentum is being shaped by {topCategory}.',
      'Your monthly expense profile shows {topCategory} as the dominant pressure point.',
      'This period highlights {topCategory} as the key driver of spending behavior.',
      'The spending pattern in {monthName} is clustering around {topCategory}.',
    ],
    [
      'A controlled weekly cap is the fastest way to absorb the {spendDeltaPct}% drift.',
      'Small corrections applied early will protect margin without aggressive cuts.',
    ],
  ),
  income: combine(
    [
      'Income moved by {incomeDeltaPct}% in {monthName}, which materially changes planning room.',
      'Your cash-in profile shifted by {incomeDeltaPct}% and deserves scenario-based planning.',
      'Monthly income dynamics are now strong enough to influence every downstream budget decision.',
      'The current income signal suggests rebalancing fixed and flexible commitments.',
    ],
    [
      'Route this change into structured reserves before lifestyle spending expands.',
      'Treat the shift as a planning lever, not a reason to relax cost controls.',
    ],
  ),
  savings: combine(
    [
      'Your savings rate sits near {savingsRatePct}% and is measurable enough to optimize.',
      'Current savings behavior is visible and consistent, which is a strong base.',
      'The {monthName} snapshot shows clear savings traction, but not yet full acceleration.',
      'Savings execution is stable, and now the focus should be compounding discipline.',
    ],
    [
      'A rule-based transfer schedule can close the gap toward {targetSavingsRatePct}%.',
      'Weekly automation is more reliable than end-of-month manual decisions.',
    ],
  ),
  risk: combine(
    [
      'Risk signals this month are mostly operational: pace, repetition, and threshold pressure.',
      'Your risk map remains manageable, but leading indicators are becoming more visible.',
      'The current pattern calls for preventive controls rather than reactive cuts.',
      'Risk concentration is not in one line item; it is spread across behavior patterns.',
    ],
    [
      'Lowering alert thresholds now can prevent expensive corrections later.',
      'Early intervention keeps volatility manageable without heavy disruption.',
    ],
  ),
  subscriptions: combine(
    [
      'Recurring commitments are narrowing budget flexibility more than expected.',
      'Subscription load is acting like a hidden fixed-cost floor in your monthly plan.',
      'Repeated charges are compressing your room for tactical adjustments.',
      'Fixed recurring payments are now a meaningful source of margin pressure.',
    ],
    [
      'A usage-based cleanup can unlock immediate breathing room.',
      'Repricing and pruning low-value plans usually gives fast wins.',
    ],
  ),
  goals: combine(
    [
      'Your goals are well framed; execution rhythm is now the critical variable.',
      'The strategy looks coherent, and consistency will determine real outcomes.',
      'Goal quality is solid, but conversion into weekly action is the next milestone.',
      'This month provides enough signal to turn goals into operating routines.',
    ],
    [
      'Short checkpoints reduce drift and keep progress visible.',
      'Turning intent into scheduled actions is the highest-leverage move.',
    ],
  ),
  cashflow: combine(
    [
      'Net cashflow closed around {netAmount} for {monthName}.',
      'The month-end cashflow readout is {netAmount}, giving a clear operating signal.',
      'Your primary operating outcome this period is {netAmount}.',
      'Cashflow balance in {monthName} settled near {netAmount}.',
    ],
    [
      'Timing discipline can improve stability even before income changes.',
      'Weekly flow management will smooth stress across the month.',
    ],
  ),
  debt: combine(
    [
      'Debt-service pressure is still consuming meaningful planning capacity.',
      'Repayment load remains a secondary drag on monthly flexibility.',
      'The debt lane is narrowing optionality more than the topline suggests.',
      'This month indicates debt sequencing should be tightened further.',
    ],
    [
      'Prioritizing expensive balances first is usually the fastest relief path.',
      'Aligning due dates with inflows lowers penalty and rollover risk.',
    ],
  ),
  investing: combine(
    [
      'The current setup supports disciplined investing, provided liquidity stays protected.',
      'You now have a reasonable base to extend into rule-based portfolio actions.',
      'Investment decisions can move from ad-hoc to systematic in this cycle.',
      'Your profile can absorb gradual allocation, but only with risk controls intact.',
    ],
    [
      'Phased entries and diversification should remain your default posture.',
      'Keep reserve buffers intact while scaling long-term positions.',
    ],
  ),
  budgeting: combine(
    [
      'Budget limits are approaching stress zones in selected categories.',
      'Category-level usage is signaling that limit management needs tighter cadence.',
      'The budget frame is still workable, but threshold discipline must improve now.',
      'Your month-to-date limit behavior suggests early correction is needed.',
    ],
    [
      '{overBudgetCount} over-limit and {nearBudgetCount} near-limit signals require structured control.',
      'Splitting monthly ceilings into weekly budgets will reduce end-month pressure.',
    ],
  ),
};

const enFindings: Record<CategoryKey, string[]> = {
  spending: combine(
    [
      '{topCategory} is currently the strongest expense driver in your distribution.',
      'Spending concentration is visible in {topCategory}, which is steering total outflow.',
      'Month-to-date variance is largely explained by activity in {topCategory}.',
      'The fastest-moving expense lane this cycle is {topCategory}.',
    ],
    [
      'At {spendDeltaPct}%, this pace can compress margin if left unmanaged.',
      'Targeted controls here will deliver better outcomes than broad cuts.',
    ],
  ),
  income: combine(
    [
      'Income behavior changed enough to justify dual-scenario planning.',
      '{incomeDeltaPct}% movement in inflows is material for your operating plan.',
      'Your current income signal has direct impact on savings and debt cadence.',
      'The inflow profile is now a key decision variable, not background noise.',
    ],
    [
      'Plan with buffer assumptions to keep execution resilient.',
      'Treat volatility management as part of the income strategy itself.',
    ],
  ),
  savings: combine(
    [
      'Savings performance is visible at {savingsRatePct}% and can be scaled with structure.',
      'Your savings trend is present, but consistency remains the multiplier.',
      'This cycle confirms that your savings behavior is stable enough to optimize.',
      'The data shows savings traction, though automation could increase reliability.',
    ],
    [
      'Moving toward {targetSavingsRatePct}% depends more on cadence than intensity.',
      'Frequent small transfers usually outperform occasional large efforts.',
    ],
  ),
  risk: combine(
    [
      'Risk is coming from behavior clusters, not just one category.',
      'Leading risk signals are mostly in threshold pressure and transaction pace.',
      'The profile suggests controllable risk, but only with earlier interventions.',
      'Risk drift appears operational and can be reduced through tighter routines.',
    ],
    [
      'Early warning controls are the highest-return fix right now.',
      'Reducing reaction lag is more important than reducing spending volume.',
    ],
  ),
  subscriptions: combine(
    [
      'Recurring payments are reducing tactical flexibility.',
      'Fixed commitments are acting as a margin ceiling this month.',
      'Subscription spend is creating a steady drag on optional cash use.',
      'Repeated charges are limiting your room for adaptive decisions.',
    ],
    [
      'A quick value audit can release immediate cashflow capacity.',
      'Removing low-utility plans can improve short-term resilience.',
    ],
  ),
  goals: combine(
    [
      'Goal direction is clear, and execution cadence is now the bottleneck.',
      'Your objective stack is strong enough for measurable weekly delivery.',
      'Goal quality is not the issue; operating rhythm is.',
      'The framework is valid and ready for tighter review loops.',
    ],
    [
      'Breakdown into weekly checkpoints will improve follow-through.',
      'A visible tracking loop will reduce slippage materially.',
    ],
  ),
  cashflow: combine(
    [
      'Net operating result stands near {netAmount} for this period.',
      'Cashflow ended at roughly {netAmount}, which sets your short-term risk posture.',
      'The month closed with {netAmount} as the primary control metric.',
      'Your current cashflow endpoint is {netAmount}.',
    ],
    [
      'Flow timing can improve this without changing total income.',
      'Weekly balancing will smooth execution stress.',
    ],
  ),
  debt: combine(
    [
      'Debt obligations are still tightening liquidity bandwidth.',
      'Repayment load is reducing your optional decision space.',
      'Debt pressure remains a measurable constraint in this cycle.',
      'Servicing costs are competing directly with savings capacity.',
    ],
    [
      'Priority sequencing can lower total financing drag faster.',
      'Aligning repayment timing with inflows reduces friction.',
    ],
  ),
  investing: combine(
    [
      'Investment readiness is improving, provided liquidity discipline remains intact.',
      'Your profile supports gradual allocation rather than tactical timing.',
      'Portfolio execution can now be systematized with clear guardrails.',
      'This month supports an incremental investing stance with risk controls.',
    ],
    [
      'Diversification and pacing should stay non-negotiable.',
      'Protect reserve buffers while building long-term exposure.',
    ],
  ),
  budgeting: combine(
    [
      'Limit behavior indicates early-stage budget stress in specific categories.',
      'Category-level pressure is rising even if total budget still looks manageable.',
      'Current usage velocity suggests tighter budget cadence is needed.',
      'The budget remains recoverable, but control windows are narrowing.',
    ],
    [
      '{overBudgetCount} over-limit and {nearBudgetCount} near-limit markers confirm intervention need.',
      'Weekly limit slicing will reduce late-month overruns.',
    ],
  ),
};

const enActions: Record<CategoryKey, string[]> = {
  spending: combine(
    [
      'Set a daily cap for {topCategory} and make it visible in your weekly tracker.',
      'Apply a single-transaction ceiling to {topCategory} for the next 7 days.',
      'Batch {topCategory} purchases into fixed windows to reduce impulse frequency.',
      'Move category alerts one step earlier for {topCategory} this month.',
    ],
    [
      'This directly addresses the {spendDeltaPct}% drift.',
      'You should see faster control with minimal disruption.',
    ],
  ),
  income: combine(
    [
      'On income day, split inflow into operating cash and protected reserve automatically.',
      'Treat variable income periods with two budget scenarios: base and conservative.',
      'Delay fixed-cost upgrades by 72 hours when income shifts quickly.',
      'Route incremental inflow toward debt/savings before discretionary spend.',
    ],
    [
      'This keeps planning resilient under {incomeDeltaPct}% volatility.',
      'It protects execution quality without overcorrecting.',
    ],
  ),
  savings: combine(
    [
      'Schedule a fixed weekly savings transfer and remove manual friction.',
      'Split monthly savings goals into weekly checkpoints with visible progress.',
      'Trigger savings transfer before discretionary spending windows.',
      'Automate a minimum contribution rule that runs every week.',
    ],
    [
      'This is the most reliable path from {savingsRatePct}% toward {targetSavingsRatePct}%.',
      'Cadence beats intensity for long-term consistency.',
    ],
  ),
  risk: combine(
    [
      'Lower alert thresholds in high-variance categories immediately.',
      'Add a review step before high-frequency discretionary payments.',
      'Track top risk categories in a separate weekly control sheet.',
      'Run a 7-day control sprint focused on three high-impact metrics.',
    ],
    [
      'This reduces reaction lag before risk compounds.',
      'Early control usually outperforms late correction.',
    ],
  ),
  subscriptions: combine(
    [
      'Classify subscriptions by utility, frequency, and replaceability this week.',
      'Pause at least one low-usage recurring service immediately.',
      'Compare annual/monthly plans and downgrade overpriced commitments.',
      'Consolidate overlapping services into one lower-cost option.',
    ],
    [
      'This restores flexibility quickly without major lifestyle disruption.',
      'Fixed-cost cleanup typically yields immediate margin gains.',
    ],
  ),
  goals: combine(
    [
      'Convert monthly goals into weekly actions and place them on calendar blocks.',
      'Prioritize two high-impact goals and defer low-impact tasks temporarily.',
      'Run a 10-minute weekly goal review ritual on the same day each week.',
      'Use a lightweight goal dashboard with binary completion signals.',
    ],
    [
      'Execution quality improves when progress stays visible.',
      'This structure reduces drift and improves follow-through.',
    ],
  ),
  cashflow: combine(
    [
      'Align outgoing payment dates with income windows in your weekly map.',
      'Distribute large outflows instead of clustering them into a single week.',
      'Set a minimum balance warning threshold for operational cash.',
      'Schedule high-ticket expenses right after inflow events.',
    ],
    [
      'This will stabilize cashflow around {netAmount}.',
      'Timing optimization often lowers stress faster than cost cutting.',
    ],
  ),
  debt: combine(
    [
      'Rank debt lines by effective cost and prioritize repayment in that order.',
      'Automate minimum due payments near income dates.',
      'Apply extra repayment only to the highest-cost debt line first.',
      'Review debt progress weekly, not monthly, until pressure eases.',
    ],
    [
      'You will reduce financing drag more quickly.',
      'This also lowers penalty and rollover exposure.',
    ],
  ),
  investing: combine(
    [
      'Use phased, periodic entries instead of single timing-heavy moves.',
      'Reduce concentration risk and rebalance toward broader exposure.',
      'Check liquidity threshold before opening any new long-term position.',
      'Schedule quarterly portfolio reviews with explicit risk limits.',
    ],
    [
      'This improves resilience while preserving upside participation.',
      'Consistency and diversification remain the core edge.',
    ],
  ),
  budgeting: combine(
    [
      'Create weekly micro-budgets for categories near the threshold.',
      'Move alert triggers to 80% usage for sensitive categories.',
      'Recalibrate limits using recent three-month behavior.',
      'Apply per-transaction caps where limit velocity is too high.',
    ],
    [
      'This directly addresses {overBudgetCount} over-limit and {nearBudgetCount} near-limit signals.',
      'You should see fewer late-month overruns with this cadence.',
    ],
  ),
};

const enGenericAdviceSummaries = combine(
  [
    '{monthName} data confirms that consistency is outperforming intensity.',
    'Your current profile is manageable with disciplined weekly controls.',
    'The month shows that process quality is now more important than one-off fixes.',
    'Small structured adjustments can materially improve your next cycle.',
  ],
  [
    'Focus on two high-impact actions first.',
    'Automated routines will protect momentum.',
    'Keep decisions measurable and time-bound.',
    'Review cadence should be weekly, not reactive.',
  ],
);

const enGenericFindings = combine(
  [
    'Behavior patterns are now more important than isolated transactions.',
    'Early warning signals are visible before major budget breaks.',
    'Timing and frequency are shaping outcomes as much as absolute amounts.',
    'Execution rhythm is the strongest predictor of next-month stability.',
  ],
  [
    'This is actionable with lightweight controls.',
    'Fast, focused corrections will have outsized impact.',
    'You can improve outcomes without heavy lifestyle disruption.',
    'Weekly visibility is the main accelerant.',
  ],
);

const enGenericActions = combine(
  [
    'Run a 10-minute weekly finance reset at a fixed time.',
    'Track only three control metrics for the next 14 days.',
    'Move repetitive decisions into automation rules where possible.',
    'Apply a 24-hour pause rule to non-essential purchases.',
  ],
  [
    'This will improve decision quality quickly.',
    'You should see lower variance within one cycle.',
    'The structure is simple enough to sustain.',
    'It reduces stress while preserving control.',
  ],
);

export const templateBankEn: TemplateBank = {
  adviceSummaries: enAdviceSummaries,
  findings: enFindings,
  actions: enActions,
  generic: {
    adviceSummaries: enGenericAdviceSummaries,
    findings: enGenericFindings,
    actions: enGenericActions,
  },
};

