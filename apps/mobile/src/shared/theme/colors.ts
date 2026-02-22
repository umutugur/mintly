export const colors = {
  primary: '#2F6BFF',
  primaryMuted: '#EAF0FF',
  income: '#17B26A',
  expense: '#F04438',
  background: '#F3F6FC',
  surface: '#FFFFFF',
  border: '#D8E0EE',
  text: '#0F172A',
  textMuted: '#64748B',
  chartA: '#2F6BFF',
  chartB: '#17B26A',
  chartC: '#F79009',
  chartD: '#F04438',
  dark: {
    background: '#0B1221',
    surface: '#121B2E',
    border: '#23314D',
    text: '#E2E8F0',
    textMuted: '#9AA9C0',
  },
} as const;

export const shadows = {
  card: {
    shadowColor: '#0A1F44',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
} as const;
