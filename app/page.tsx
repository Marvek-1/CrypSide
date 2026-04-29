'use client';

import Link from 'next/link';
import { AppShell, Icon, cx } from './components/mostarUi';

const MODULES = [
  { href: '/ingestion', label: 'Ingestion', icon: 'radar' as const, desc: 'Sovereign scanner — live signal feed and gate analytics' },
  { href: '/training', label: 'Training', icon: 'brain' as const, desc: 'Training candidates, gate kill breakdown, regime distribution' },
  { href: '/observer', label: 'Observer', icon: 'eye' as const, desc: 'Live market observer — funding, OI, L/S ratio telemetry' },
  { href: '/live', label: 'Live', icon: 'activity' as const, desc: 'Live signal stream and execution ledger' },
  { href: '/live-engine', label: 'Live Engine', icon: 'gauge' as const, desc: 'Engine health, scanner state, process monitor' },
  { href: '/live-trading', label: 'Live Trading', icon: 'lock' as const, desc: 'Execution cockpit — locked until confidence gate clears' },
];

export default function HomePage() {
  return (
    <AppShell max="max-w-[1400px]">
      <div className="flex flex-col gap-2 pt-2">
        <div className="mostar-pill mostar-pill-gold inline-flex w-fit px-3 py-1 text-[10px]">Sovereign Console</div>
        <h1 className="mostar-text-white text-3xl font-black tracking-tight">MoStar CrypSide</h1>
        <p className="mostar-text-muted text-sm">Scanner · Ingestion · Training · Observer · Live Terminal</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className={cx(
              'mostar-panel group relative flex flex-col gap-3 rounded-3xl p-5',
              'transition-all duration-200 hover:border-[color-mix(in_srgb,var(--mostar-gold)_28%,transparent)]',
              'no-underline'
            )}
          >
            <div className="mostar-panel-glow pointer-events-none absolute inset-0" />
            <div className="relative flex items-center gap-3">
              <div className="mostar-status-warning rounded-2xl p-2">
                <Icon name={m.icon} size={17} />
              </div>
              <span className="mostar-text-white text-[11px] font-black uppercase tracking-[0.22em]">{m.label}</span>
            </div>
            <p className="relative mostar-text-muted text-xs leading-relaxed">{m.desc}</p>
          </Link>
        ))}
      </div>

      <div className="mostar-panel rounded-3xl p-5">
        <div className="mostar-panel-glow pointer-events-none absolute inset-0" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mostar-text-white text-[11px] font-black uppercase tracking-[0.24em]">Doctrine</div>
            <p className="mostar-text-muted mt-1 text-xs">Paper mode only · Live execution locked until confidence gate clears · 200+ eligible resolved signals · PF ≥ 1.30 · Manual approval required</p>
          </div>
          <span className="mostar-pill mostar-pill-blue px-3 py-1 text-[10px]">🜃∴🜂 Sovereign</span>
        </div>
      </div>
    </AppShell>
  );
}
