import {
  Bell,
  Gauge,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  Wallet,
  Users,
  X,
} from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  asApiError,
  clearStoredToken,
  getAdminSession,
  getStoredToken,
  login as loginRequest,
} from './lib/api';
import { cn, defaultDateRange, type DateRangeValue } from './lib/utils';
import { Badge, Button, Modal } from './components/ui';

interface ToastItem {
  id: number;
  title: string;
  description: string;
  tone: 'neutral' | 'success' | 'danger';
}

interface ModalState {
  open: boolean;
  title: string;
  description?: string;
}

interface FeatureFlags {
  animatedCharts: boolean;
  denseTables: boolean;
  highlightSignals: boolean;
}

interface AdminIdentity {
  id: string;
  email: string;
  name: string | null;
  role: 'admin';
  createdAt: string;
}

const UiContext = createContext<{
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: number) => void;
  modal: ModalState;
  openModal: (modal: Omit<ModalState, 'open'>) => void;
  closeModal: () => void;
} | null>(null);

const ShellContext = createContext<{
  globalSearch: string;
  setGlobalSearch: (value: string) => void;
  dateRange: DateRangeValue;
  setDateRange: (next: DateRangeValue) => void;
  featureFlags: FeatureFlags;
  setFeatureFlag: (key: keyof FeatureFlags, value: boolean) => void;
} | null>(null);

const AuthContext = createContext<{
  token: string | null;
  admin: AdminIdentity | null;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<AdminIdentity>;
  isHydrated: boolean;
} | null>(null);

const FEATURE_FLAG_KEY = 'montly_admin_feature_flags';

export function UiProvider(props: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modal, setModal] = useState<ModalState>({
    open: false,
    title: '',
  });

  function pushToast(toast: Omit<ToastItem, 'id'>) {
    const next = {
      ...toast,
      id: Date.now() + Math.round(Math.random() * 1000),
    };
    setToasts((current) => [...current.slice(-3), next]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== next.id));
    }, 4000);
  }

  function dismissToast(id: number) {
    setToasts((current) => current.filter((item) => item.id !== id));
  }

  function openModal(next: Omit<ModalState, 'open'>) {
    setModal({
      open: true,
      ...next,
    });
  }

  function closeModal() {
    setModal({
      open: false,
      title: '',
    });
  }

  return (
    <UiContext.Provider value={{ toasts, pushToast, dismissToast, modal, openModal, closeModal }}>
      {props.children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-3 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-start justify-between gap-4 rounded-2xl border px-4 py-3 shadow-panel backdrop-blur',
              toast.tone === 'neutral' && 'border-white/10 bg-panel-900/90 text-panel-100',
              toast.tone === 'success' && 'border-success/30 bg-success/10 text-success',
              toast.tone === 'danger' && 'border-danger/30 bg-danger/10 text-danger',
            )}
          >
            <div>
              <p className="text-sm font-semibold">{toast.title}</p>
              <p className="mt-1 text-sm opacity-90">{toast.description}</p>
            </div>
            <button type="button" onClick={() => dismissToast(toast.id)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <Modal
        open={modal.open}
        title={modal.title}
        description={modal.description}
        onClose={closeModal}
      />
    </UiContext.Provider>
  );
}

export function ShellProvider(props: PropsWithChildren) {
  const [globalSearch, setGlobalSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRange(30));
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(() => {
    if (typeof window === 'undefined') {
      return {
        animatedCharts: true,
        denseTables: false,
        highlightSignals: true,
      };
    }

    const raw = window.localStorage.getItem(FEATURE_FLAG_KEY);
    if (!raw) {
      return {
        animatedCharts: true,
        denseTables: false,
        highlightSignals: true,
      };
    }

    try {
      return JSON.parse(raw) as FeatureFlags;
    } catch {
      return {
        animatedCharts: true,
        denseTables: false,
        highlightSignals: true,
      };
    }
  });

  useEffect(() => {
    window.localStorage.setItem(FEATURE_FLAG_KEY, JSON.stringify(featureFlags));
  }, [featureFlags]);

  function setFeatureFlag(key: keyof FeatureFlags, value: boolean) {
    setFeatureFlags((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <ShellContext.Provider
      value={{
        globalSearch,
        setGlobalSearch,
        dateRange,
        setDateRange,
        featureFlags,
        setFeatureFlag,
      }}
    >
      {props.children}
    </ShellContext.Provider>
  );
}

export function AuthProvider(props: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setToken(getStoredToken());
    setIsHydrated(true);
  }, []);

  function logout() {
    clearStoredToken();
    setToken(null);
    setAdmin(null);
    queryClient.clear();
  }

  async function restoreSession(): Promise<AdminIdentity> {
    const session = await getAdminSession();

    if (!session.admin) {
      throw new Error('Admin session not available.');
    }

    setAdmin(session.admin);
    return session.admin;
  }

  async function login(input: { email: string; password: string }) {
    await loginRequest(input);
    setToken(getStoredToken());
    await restoreSession();
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        admin,
        login,
        logout,
        restoreSession,
        isHydrated,
      }}
    >
      {props.children}
    </AuthContext.Provider>
  );
}

export function useUi() {
  const value = useContext(UiContext);

  if (!value) {
    throw new Error('UiProvider is missing.');
  }

  return value;
}

export function useShell() {
  const value = useContext(ShellContext);

  if (!value) {
    throw new Error('ShellProvider is missing.');
  }

  return value;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('AuthProvider is missing.');
  }

  return value;
}

export function useErrorToast(error: unknown, title = 'Request failed') {
  const { pushToast } = useUi();
  const lastKeyRef = useRef<string | null>(null);
  const normalized = error ? asApiError(error) : null;

  useEffect(() => {
    if (!normalized) {
      lastKeyRef.current = null;
      return;
    }

    const key = `${title}:${normalized.code}:${normalized.message}`;
    if (lastKeyRef.current === key) {
      return;
    }

    lastKeyRef.current = key;
    pushToast({
      title,
      description: normalized.message,
      tone: 'danger',
    });
  }, [normalized, pushToast, title]);
}

export function ProtectedRoute() {
  const { token, admin, restoreSession, logout, isHydrated } = useAuth();
  const sessionQuery = useQuery({
    queryKey: ['admin-session', token],
    queryFn: restoreSession,
    enabled: Boolean(token) && !admin && isHydrated,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-panel-950 text-panel-100">
        <ShieldCheck className="h-8 w-8 animate-pulse" />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (sessionQuery.isError) {
    logout();
    return <Navigate to="/login" replace />;
  }

  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-panel-950 text-panel-100">
        <ShieldCheck className="h-8 w-8 animate-pulse" />
      </div>
    );
  }

  return <Outlet />;
}

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/transactions', label: 'Transactions', icon: Wallet },
  { to: '/analytics', label: 'Analytics', icon: Gauge },
  { to: '/notifications', label: 'Notifications Health', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AdminShell() {
  const { admin, logout } = useAuth();
  const { globalSearch, setGlobalSearch, dateRange, setDateRange } = useShell();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const badgeLabel = (import.meta.env.VITE_ENV_BADGE as string | undefined) ?? import.meta.env.MODE;

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-panel-950 bg-grid [background-size:32px_32px] text-panel-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col md:flex-row">
        <aside className="border-b border-white/8 bg-panel-950/95 px-4 py-4 backdrop-blur md:min-h-screen md:w-72 md:border-b-0 md:border-r md:px-5 md:py-6">
          <div className="mb-5 flex items-center justify-between gap-3 md:mb-8 md:block">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-300">Montly</p>
              <h1 className="mt-1 font-display text-2xl font-bold text-white">Web Panel</h1>
            </div>
            <Badge tone="warning">{badgeLabel}</Badge>
          </div>

          <nav className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex min-w-fit items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition',
                      isActive
                        ? 'bg-accent-500 text-panel-950'
                        : 'bg-transparent text-panel-200 hover:bg-white/5 hover:text-white',
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-white/8 bg-panel-950/85 px-4 py-4 backdrop-blur md:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-1 items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                <Search className="h-4 w-4 text-panel-200" />
                <input
                  value={globalSearch}
                  onChange={(event) => setGlobalSearch(event.target.value)}
                  placeholder="Global search for users and transactions"
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-panel-200"
                />
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="grid grid-cols-2 gap-3">
                  <label className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">
                    From
                    <input
                      type="date"
                      value={dateRange.from}
                      onChange={(event) =>
                        setDateRange({
                          ...dateRange,
                          from: event.target.value,
                        })
                      }
                      className="mt-1 block w-full bg-transparent text-sm font-normal text-white outline-none"
                    />
                  </label>
                  <label className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">
                    To
                    <input
                      type="date"
                      value={dateRange.to}
                      onChange={(event) =>
                        setDateRange({
                          ...dateRange,
                          to: event.target.value,
                        })
                      }
                      className="mt-1 block w-full bg-transparent text-sm font-normal text-white outline-none"
                    />
                  </label>
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((current) => !current)}
                    className="flex min-w-[220px] items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">Admin</p>
                      <p className="mt-1 text-sm font-semibold text-white">{admin?.name ?? admin?.email}</p>
                    </div>
                    <LogOut className="h-4 w-4 text-panel-200" />
                  </button>

                  {menuOpen ? (
                    <div className="absolute right-0 top-[calc(100%+10px)] w-72 rounded-2xl border border-white/10 bg-panel-900 p-3 shadow-panel">
                      <p className="text-sm font-semibold text-white">{admin?.name ?? 'Montly Admin'}</p>
                      <p className="mt-1 text-sm text-panel-200">{admin?.email}</p>
                      <Button className="mt-3 w-full" variant="secondary" onClick={logout}>
                        Logout
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export function PageSection(props: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">{props.title}</h2>
          {props.subtitle ? <p className="mt-1 text-sm text-panel-200">{props.subtitle}</p> : null}
        </div>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}
