import type { TextStyle } from 'react-native';

export const typography: Record<string, TextStyle> = {
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  heading: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  subheading: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  amount: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
};
