export type AdviceSummaryTemplate = string;
export type FindingTemplate = string;
export type ActionTemplate = string;

export type CategoryKey =
  | 'spending'
  | 'income'
  | 'savings'
  | 'risk'
  | 'subscriptions'
  | 'goals'
  | 'cashflow'
  | 'debt'
  | 'investing'
  | 'budgeting';

export interface TemplateBank {
  adviceSummaries: Record<CategoryKey, AdviceSummaryTemplate[]>;
  findings: Record<CategoryKey, FindingTemplate[]>;
  actions: Record<CategoryKey, ActionTemplate[]>;
  generic: {
    adviceSummaries: AdviceSummaryTemplate[];
    findings: FindingTemplate[];
    actions: ActionTemplate[];
  };
}

export type AdvisorTemplateLanguage = 'tr' | 'en' | 'ru';

