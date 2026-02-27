import { StackActions, type NavigationProp, type ParamListBase } from '@react-navigation/native';

type AnyNavigation = NavigationProp<ParamListBase> & {
  getParent?: () => AnyNavigation | undefined;
  getState: () => {
    key?: string;
    type?: string;
    index?: number;
    routes?: unknown[];
  };
  dispatch: (action: unknown) => void;
  canGoBack?: () => boolean;
  goBack?: () => void;
  popToTop?: () => void;
  navigate: (routeName: string) => void;
};

function isStackLikeState(state: {
  type?: string;
  index?: number;
  routes?: unknown[];
} | null | undefined): state is {
  key?: string;
  type?: string;
  index: number;
  routes: unknown[];
} {
  if (!state) {
    return false;
  }

  if (!Array.isArray(state.routes) || typeof state.index !== 'number') {
    return false;
  }

  return state.type === 'stack' || state.type === undefined;
}

export function safePopToTop(
  navigation: NavigationProp<ParamListBase>,
  fallbackRouteName: string,
): void {
  const nav = navigation as AnyNavigation;
  const visited = new Set<string>();
  let current: AnyNavigation | undefined = nav;
  let guard = 0;

  while (current && guard < 10) {
    guard += 1;

    const state = current.getState?.();
    const stateKey = typeof state?.key === 'string' ? state.key : `${guard}`;
    if (visited.has(stateKey)) {
      break;
    }
    visited.add(stateKey);

    if (isStackLikeState(state) && state.index > 0) {
      try {
        current.dispatch({
          ...StackActions.popToTop(),
          target: state.key,
        });
        return;
      } catch {
        // Continue traversal and fallback safely.
      }
    }

    current = current.getParent?.();
  }

  try {
    if (typeof nav.popToTop === 'function') {
      nav.popToTop();
      return;
    }
  } catch {
    // Ignore and continue fallback.
  }

  try {
    if (nav.canGoBack?.() && typeof nav.goBack === 'function') {
      nav.goBack();
      return;
    }
  } catch {
    // Ignore and continue fallback.
  }

  try {
    nav.navigate(fallbackRouteName);
  } catch {
    // Final no-op fallback.
  }
}

