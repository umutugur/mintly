import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';

import { Button, Card } from '../components/ui';
import { useAuth, useUi } from '../providers';

export function LoginPage() {
  const { token, login } = useAuth();
  const { pushToast, openModal } = useUi();
  const [email, setEmail] = useState('admin@montly.app');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (token) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await login({ email, password });
      pushToast({
        title: 'Signed in',
        description: 'Admin session established.',
        tone: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      openModal({
        title: 'Login failed',
        description: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-panel-950 bg-grid [background-size:32px_32px] px-4 py-8 text-panel-100">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="relative overflow-hidden bg-gradient-to-br from-panel-900 via-panel-900 to-panel-800 p-8 lg:p-10">
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-accent-500/15 blur-3xl" />
          <BadgeStrip />
          <h1 className="mt-8 max-w-xl font-display text-4xl font-bold text-white lg:text-5xl">
            Internal command center for Montly operations.
          </h1>
          <p className="mt-4 max-w-xl text-base text-panel-200">
            Monitor user growth, audit transactions, validate notification health, and review platform-wide
            financial signals without touching the mobile app.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <MetricTile label="Protected" value="Admin-only JWT" />
            <MetricTile label="Connected" value="Render-ready SPA" />
            <MetricTile label="Coverage" value="Users + Finance + Analytics" />
          </div>
        </Card>

        <Card className="flex items-center p-8 lg:p-10">
          <div className="w-full">
            <div className="inline-flex rounded-2xl bg-accent-500/15 p-3 text-accent-300">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="mt-6 font-display text-3xl font-bold text-white">Admin login</h2>
            <p className="mt-2 text-sm text-panel-200">Use the dedicated admin account. All panel routes stay protected.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white outline-none transition focus:border-accent-400"
                  required
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">Password</span>
                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 transition focus-within:border-accent-400">
                  <LockKeyhole className="h-4 w-4 text-panel-200" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full bg-transparent text-white outline-none"
                    required
                  />
                </div>
              </label>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Enter web panel'}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}

function BadgeStrip() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-panel-200">
      <ShieldCheck className="h-4 w-4 text-accent-300" />
      Montly Web Panel
    </div>
  );
}

function MetricTile(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">{props.label}</p>
      <p className="mt-3 font-display text-lg font-semibold text-white">{props.value}</p>
    </div>
  );
}
