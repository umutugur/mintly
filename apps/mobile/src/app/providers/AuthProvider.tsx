import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  ApiClientError,
  loginInputSchema,
  oauthInputSchema,
  registerInputSchema,
  type AuthUser,
  type LoginInput,
  type MeResponse,
  type OauthInput,
  type RegisterInput,
} from '@mintly/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import i18n from 'i18next';

import { apiClient } from '@core/api/client';
import { trackAppEvent } from '@core/observability/telemetry';
import { apiErrorText } from '@shared/utils/apiErrorText';

const ACCESS_TOKEN_KEY = 'finsight.accessToken';
const REFRESH_TOKEN_KEY = 'finsight.refreshToken';
const AUTH_ME_QUERY_KEY = ['auth', 'me'] as const;

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
type SessionUser = MeResponse['user'];

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  authError: string | null;
  login: (input: LoginInput) => Promise<boolean>;
  oauthLogin: (input: OauthInput) => Promise<boolean>;
  register: (input: RegisterInput) => Promise<boolean>;
  logout: () => Promise<void>;
  withAuth: <T>(runner: (accessToken: string) => Promise<T>) => Promise<T>;
  refreshUser: () => Promise<SessionUser | null>;
  setSessionUser: (user: SessionUser) => void;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
  ]);
}

async function clearStoredTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

function toSessionUser(user: AuthUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    baseCurrency: null,
    savingsTargetRate: 20,
    riskProfile: 'medium',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<{ accessToken: string; refreshToken: string }> | null>(
    null,
  );

  const applySessionUser = useCallback(
    (nextUser: SessionUser | null) => {
      setUser(nextUser);
      if (nextUser) {
        queryClient.setQueryData(AUTH_ME_QUERY_KEY, { user: nextUser });
        return;
      }

      queryClient.removeQueries({ queryKey: AUTH_ME_QUERY_KEY });
    },
    [queryClient],
  );

  const clearSession = useCallback(async () => {
    refreshPromiseRef.current = null;
    applySessionUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    await clearStoredTokens();
    queryClient.clear();
    setStatus('unauthenticated');
  }, [applySessionUser, queryClient]);

  const setSession = useCallback(
    async (params: {
      accessToken: string;
      refreshToken: string;
      user: SessionUser;
    }) => {
      setAccessToken(params.accessToken);
      setRefreshToken(params.refreshToken);
      applySessionUser(params.user);
      await persistTokens(params.accessToken, params.refreshToken);
      setStatus('authenticated');
    },
    [applySessionUser],
  );

  const refreshTokens = useCallback(async (activeRefreshToken: string) => {
    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = (async () => {
        const refreshed = await apiClient.refresh({ refreshToken: activeRefreshToken });

        setAccessToken(refreshed.accessToken);
        setRefreshToken(refreshed.refreshToken);
        await persistTokens(refreshed.accessToken, refreshed.refreshToken);
        setStatus('authenticated');

        return {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
        };
      })()
        .catch(async (error: unknown) => {
          await clearSession();
          throw error;
        })
        .finally(() => {
          refreshPromiseRef.current = null;
        });
    }

    return refreshPromiseRef.current;
  }, [clearSession]);

  const withAuth = useCallback(
    async <T,>(runner: (token: string) => Promise<T>): Promise<T> => {
      if (!accessToken) {
        throw new ApiClientError({
          code: 'UNAUTHORIZED',
          message: i18n.t('errors.auth.sessionNotAvailable'),
          status: 401,
        });
      }

      try {
        return await runner(accessToken);
      } catch (error) {
        if (!(error instanceof ApiClientError) || error.status !== 401) {
          throw error;
        }

        if (!refreshToken) {
          await clearSession();
          throw error;
        }

        const refreshed = await refreshTokens(refreshToken);
        return runner(refreshed.accessToken);
      }
    },
    [accessToken, clearSession, refreshToken, refreshTokens],
  );

  const refreshUser = useCallback(async (): Promise<SessionUser | null> => {
    try {
      const me = await withAuth((token) => apiClient.getMe(token));
      applySessionUser(me.user);
      return me.user;
    } catch {
      return null;
    }
  }, [applySessionUser, withAuth]);

  const setSessionUser = useCallback(
    (nextUser: SessionUser) => {
      applySessionUser(nextUser);
    },
    [applySessionUser],
  );

  const restoreSession = useCallback(async () => {
    setStatus('loading');

    const [storedAccessToken, storedRefreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]);

    if (!storedAccessToken || !storedRefreshToken) {
      await clearSession();
      return;
    }

    try {
      const me = await apiClient.getMe(storedAccessToken);
      await setSession({
        accessToken: storedAccessToken,
        refreshToken: storedRefreshToken,
        user: me.user,
      });
      return;
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 401) {
        await clearSession();
        return;
      }
    }

    try {
      const refreshed = await apiClient.refresh({ refreshToken: storedRefreshToken });
      const me = await apiClient.getMe(refreshed.accessToken);

      await setSession({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        user: me.user,
      });
    } catch {
      await clearSession();
    }
  }, [clearSession, setSession]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const login = useCallback(
    async (input: LoginInput): Promise<boolean> => {
      const validation = loginInputSchema.safeParse(input);
      if (!validation.success) {
        setAuthError(i18n.t('auth.validation.loginInvalidInput'));
        return false;
      }

      setAuthError(null);
      trackAppEvent('auth.login', {
        category: 'auth',
        data: { stage: 'attempt' },
      });

      try {
        const response = await apiClient.login(validation.data);
        const me = await apiClient
          .getMe(response.accessToken)
          .then((result) => result.user)
          .catch(() => toSessionUser(response.user));

        await setSession({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          user: me,
        });
        trackAppEvent('auth.login', {
          category: 'auth',
          data: { stage: 'success' },
        });
        return true;
      } catch (error) {
        trackAppEvent('auth.login', {
          category: 'auth',
          level: 'warning',
          data: { stage: 'failure' },
        });
        setAuthError(apiErrorText(error));
        return false;
      }
    },
    [setSession],
  );

  const register = useCallback(
    async (input: RegisterInput): Promise<boolean> => {
      const validation = registerInputSchema.safeParse(input);
      if (!validation.success) {
        setAuthError(i18n.t('auth.validation.registerInvalidInput'));
        return false;
      }

      setAuthError(null);
      trackAppEvent('auth.register', {
        category: 'auth',
        data: { stage: 'attempt' },
      });

      try {
        const response = await apiClient.register(validation.data);
        const me = await apiClient
          .getMe(response.accessToken)
          .then((result) => result.user)
          .catch(() => toSessionUser(response.user));

        await setSession({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          user: me,
        });
        trackAppEvent('auth.register', {
          category: 'auth',
          data: { stage: 'success' },
        });
        return true;
      } catch (error) {
        trackAppEvent('auth.register', {
          category: 'auth',
          level: 'warning',
          data: { stage: 'failure' },
        });
        setAuthError(apiErrorText(error));
        return false;
      }
    },
    [setSession],
  );

  const oauthLogin = useCallback(
    async (input: OauthInput): Promise<boolean> => {
      const validation = oauthInputSchema.safeParse(input);
      if (!validation.success) {
        setAuthError(i18n.t('auth.validation.loginInvalidInput'));
        return false;
      }

      const provider = validation.data.provider;
      setAuthError(null);

      trackAppEvent('auth.login', {
        category: 'auth',
        data: { stage: 'attempt', method: provider },
      });

      try {
        const response = await apiClient.oauth(validation.data);
        const me = await apiClient
          .getMe(response.accessToken)
          .then((result) => result.user)
          .catch(() => toSessionUser(response.user));

        await setSession({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          user: me,
        });

        trackAppEvent('auth.login', {
          category: 'auth',
          data: { stage: 'success', method: provider },
        });
        return true;
      } catch (error) {
        trackAppEvent('auth.login', {
          category: 'auth',
          level: 'warning',
          data: { stage: 'failure', method: provider },
        });
        setAuthError(apiErrorText(error));
        return false;
      }
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    const activeRefreshToken = refreshToken;
    trackAppEvent('auth.logout', {
      category: 'auth',
      data: { stage: 'attempt' },
    });

    if (activeRefreshToken) {
      try {
        await apiClient.logout({ refreshToken: activeRefreshToken });
      } catch {
        // Ignore logout request failures and clear local session anyway.
      }
    }

    setAuthError(null);
    await clearSession();
    trackAppEvent('auth.logout', {
      category: 'auth',
      data: { stage: 'success' },
    });
  }, [clearSession, refreshToken]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      accessToken,
      refreshToken,
      authError,
      login,
      oauthLogin,
      register,
      logout,
      withAuth,
      refreshUser,
      setSessionUser,
      clearAuthError,
    }),
    [
      status,
      user,
      accessToken,
      refreshToken,
      authError,
      login,
      oauthLogin,
      register,
      logout,
      withAuth,
      refreshUser,
      setSessionUser,
      clearAuthError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
