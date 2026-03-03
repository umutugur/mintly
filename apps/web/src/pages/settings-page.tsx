import { Flag, Info, ShieldAlert } from 'lucide-react';

import { Button, Card, SectionHeading } from '../components/ui';
import { apiBaseUrl } from '../lib/utils';
import { PageSection, useShell, useUi } from '../providers';

export function SettingsPage() {
  const { featureFlags, setFeatureFlag, locale, setLocale } = useShell();
  const { openModal } = useUi();
  const envBadge = (import.meta.env.VITE_ENV_BADGE as string | undefined) ?? import.meta.env.MODE;
  const commitSha = (import.meta.env.VITE_COMMIT_SHA as string | undefined) ?? 'not-set';

  return (
    <>
      <PageSection
        title="Ayarlar"
        subtitle="Yalnızca admin için panel ayarları, ortam görünürlüğü ve yıkıcı olmayan kontrol alanları."
      >
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Card>
            <SectionHeading title="Ortam" subtitle="Destek ve denetim için yararlı dağıtım metaverileri." />
            <div className="grid gap-4 md:grid-cols-2">
              <InfoRow label="Ortam rozeti" value={envBadge} />
              <InfoRow label="API adresi" value={apiBaseUrl()} />
              <InfoRow label="Commit SHA" value={commitSha} />
              <InfoRow label="Mod" value={import.meta.env.MODE} />
            </div>
          </Card>

          <Card>
            <SectionHeading title="İstemci özellik bayrakları" subtitle="Bu tarayıcı profiline özel yerel anahtarlar." />
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">Panel dili</p>
                  <p className="mt-1 text-sm text-panel-200">Varsayılan `tr-TR` olarak açılır ve localStorage'da korunur.</p>
                </div>
                <select
                  value={locale}
                  onChange={(event) => setLocale(event.target.value)}
                  className="rounded-2xl border border-white/10 bg-panel-900 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="tr-TR">tr-TR</option>
                  <option value="en-US">en-US</option>
                </select>
              </label>
              <FlagToggle
                title="Animasyonlu grafikler"
                description="Grafik animasyonlarını ve vurgu efektlerini açıp kapatır."
                checked={featureFlags.animatedCharts}
                onChange={(checked) => setFeatureFlag('animatedCharts', checked)}
              />
              <FlagToggle
                title="Sık tablolar"
                description="Daha hızlı tarama için tablo boşluklarını azaltır."
                checked={featureFlags.denseTables}
                onChange={(checked) => setFeatureFlag('denseTables', checked)}
              />
              <FlagToggle
                title="Sinyalleri vurgula"
                description="Analitik sinyal kartlarını daha belirgin gösterir."
                checked={featureFlags.highlightSignals}
                onChange={(checked) => setFeatureFlag('highlightSignals', checked)}
              />
            </div>
          </Card>
        </div>
      </PageSection>

      <PageSection title="Riskli alan" subtitle="Yalnızca arayüz. Açık talep olmadan yıkıcı işlem etkin değildir.">
        <Card className="border-danger/25">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-danger/15 p-3 text-danger">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-white">Yıkıcı kontrol yok</h3>
                <p className="mt-2 text-sm text-panel-200">
                  Bu panel varsayılan olarak silme, kullanıcı taklidi veya ham token incelemesi içermez.
                </p>
              </div>
            </div>
            <Button
              variant="danger"
              onClick={() =>
                openModal({
                  title: 'Riskli alan kilitli',
                  description:
                    'Bu yapıda yıkıcı kontroller bilerek kapalı tutuldu. Yalnızca açık talep olursa ayrı bir akış ekleyin.',
                })
              }
            >
              <Info className="mr-2 h-4 w-4" />
              Neden kilitli?
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
