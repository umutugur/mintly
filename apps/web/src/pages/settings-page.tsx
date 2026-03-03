import { Flag, Info, ShieldAlert } from 'lucide-react';

import { Button, Card, SectionHeading } from '../components/ui';
import { apiBaseUrl } from '../lib/utils';
import { PageSection, useShell, useUi } from '../providers';

export function SettingsPage() {
  const { featureFlags, setFeatureFlag } = useShell();
  const { openModal } = useUi();
  const envBadge = (import.meta.env.VITE_ENV_BADGE as string | undefined) ?? import.meta.env.MODE;
  const commitSha = (import.meta.env.VITE_COMMIT_SHA as string | undefined) ?? 'not-set';

  return (
    <>
      <PageSection
        title="Settings"
        subtitle="Admin-only panel settings, environment visibility, and non-destructive control surfaces."
      >
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card>
            <SectionHeading title="Environment" subtitle="Useful deployment metadata for support and audits." />
            <div className="grid gap-4 md:grid-cols-2">
              <InfoRow label="Environment badge" value={envBadge} />
              <InfoRow label="API base URL" value={apiBaseUrl()} />
              <InfoRow label="Commit SHA" value={commitSha} />
              <InfoRow label="Mode" value={import.meta.env.MODE} />
            </div>
          </Card>

          <Card>
            <SectionHeading title="Client feature flags" subtitle="Local-only switches for this browser session profile." />
            <div className="space-y-3">
              <FlagToggle
                title="Animated charts"
                description="Toggle chart point animations and emphasis."
                checked={featureFlags.animatedCharts}
                onChange={(checked) => setFeatureFlag('animatedCharts', checked)}
              />
              <FlagToggle
                title="Dense tables"
                description="Reduce table breathing room for quicker scanning."
                checked={featureFlags.denseTables}
                onChange={(checked) => setFeatureFlag('denseTables', checked)}
              />
              <FlagToggle
                title="Highlight signals"
                description="Show stronger emphasis on analytics signal cards."
                checked={featureFlags.highlightSignals}
                onChange={(checked) => setFeatureFlag('highlightSignals', checked)}
              />
            </div>
          </Card>
        </div>
      </PageSection>

      <PageSection title="Danger zone" subtitle="UI only. No destructive actions are enabled unless explicitly requested.">
        <Card className="border-danger/25">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-danger/15 p-3 text-danger">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-white">No destructive controls</h3>
                <p className="mt-2 text-sm text-panel-200">
                  This panel intentionally stops short of deletes, impersonation, or token inspection by default.
                </p>
              </div>
            </div>
            <Button
              variant="danger"
              onClick={() =>
                openModal({
                  title: 'Danger zone locked',
                  description:
                    'Destructive controls are intentionally disabled in this build. Add a dedicated workflow only when explicitly requested.',
                })
              }
            >
              <Info className="mr-2 h-4 w-4" />
              Why locked?
            </Button>
          </div>
        </Card>
      </PageSection>
    </>
  );
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-panel-200">{props.label}</p>
      <p className="mt-2 break-all text-sm font-semibold text-white">{props.value}</p>
    </div>
  );
}

function FlagToggle(props: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-white">{props.title}</p>
        <p className="mt-1 text-sm text-panel-200">{props.description}</p>
      </div>
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
    </label>
  );
}
