import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { captureException } from '@core/observability/sentry';
import { useI18n } from '@shared/i18n';
import { radius, spacing, typography, useTheme } from '@shared/theme';
interface ErrorBoundaryState {
  hasError: boolean;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  renderFallback: (reset: () => void) => ReactNode;
}

class ErrorBoundaryInner extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureException(error, { componentStack: info.componentStack ?? '' });
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return this.props.renderFallback(this.reset);
    }

    return this.props.children;
  }
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { theme, mode } = useTheme();

  return (
    <ErrorBoundaryInner
      renderFallback={(reset) => (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: mode === 'dark' ? '#2A2D42' : '#E4EAF5',
              },
            ]}
          >
            <Text style={[styles.title, { color: theme.colors.text }]}>{t('errors.boundary.title')}</Text>
            <Text style={[styles.message, { color: theme.colors.textMuted }]}>
              {t('errors.boundary.message')}
            </Text>

            <Pressable
              accessibilityRole="button"
              onPress={reset}
              style={({ pressed }) => [
                styles.retryButton,
                { backgroundColor: theme.colors.primary, opacity: pressed ? 0.86 : 1 },
              ]}
            >
              <Text style={styles.retryLabel}>{t('errors.boundary.retry')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    >
      {children}
    </ErrorBoundaryInner>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    maxWidth: 420,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    width: '100%',
  },
  title: {
    ...typography.heading,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    lineHeight: 22,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    justifyContent: 'center',
    marginTop: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  retryLabel: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
