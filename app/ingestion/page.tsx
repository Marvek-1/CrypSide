// app/ingestion/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AppShell, Icon, IconName, Metric, Panel, cx, fmt, pct, safeFixed } from '../components/mostarUi';

type Signal = { signal_id?: string; id?: string; pair: string; ts?: string; timestamp?: string; side: string; score: number };
type Stats = { total_signals: number; wins: number; losses: number; win_rate: number; profit_factor: number; signals_per_day: number };
type MoEdgeSentinel = {
  status: string;
  meaning: string;
  threshold_check: { '00_15_ev': number; '15_30_ev': number; '30_45_ev': number; '45_plus_ev': number };
  last_checked: number;
};
type KillAnalytics = {
  gate_stats: Array<{ rejection_gate: string; killed_count: number; kill_percentage: number }>;
  overall: { total_candidates: number; passed_gates: number; killed_by_gates: number; overall_kill_rate: number };
  top_killer_24h: { rejection_gate: string; kill_count_24h: number } | null;
  last_checked: number;
};

function statusTone(status: string) {
  const s = status.toLowerCase();
  if (s.includes('predictive') || s.includes('run') || s.includes('online') || s.includes('active')) return 'mostar-status-live';
  if (s.includes('misweighted') || s.includes('negative') || s.includes('degraded') || s.includes('unknown') || s.includes('loading')) return 'mostar-status-warning';
  return 'mostar-status-danger';
}
function killTone(rate: number) { return rate >= 90 ? 'mostar-status-danger' : 'mostar-status-warning'; }
function evTone(value: number) { if (value > 0) return 'text-[var(--mostar-success)]'; if (value < 0) return 'text-[#FF8585]'; return 'text-[var(--mostar-white)]'; }
function sideTone(side: string) { const s = side.toUpperCase(); if (s === 'LONG') return 'mostar-status-live'; if (s === 'SHORT') return 'mostar-status-danger'; return 'mostar-status-warning'; }
function safeTs(value?: number | string) {
  if (!value) return '—';
  const n = Number(value);
  const date = Number.isFinite(n) ? new Date(n > 10_000_000_000 ? n : n * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString();
}

function ConduitCore({ scannerState, sentinelStatus, killRate }: { scannerState: string; sentinelStatus?: string; killRate: number }) {
  const critical = scannerState.toLowerCase().includes('down') || scannerState.toLowerCase().includes('stop') || killRate >= 90;
  const warning = !critical && (scannerState.toLowerCase().includes('degraded') || scannerState.toLowerCase().includes('unknown') || killRate >= 70 || sentinelStatus?.includes('NEGATIVE') || sentinelStatus?.includes('MISWEIGHTED'));
  const glow = critical ? 'from-[var(--mostar-danger)] via-[var(--mostar-gold)] to-[var(--mostar-danger)]' : warning ? 'from-[var(--mostar-gold)] via-[var(--mostar-royal-blue)] to-[var(--mostar-yellow)]' : 'from-[var(--mostar-royal-blue)] via-[var(--mostar-white)] to-[var(--mostar-gold)]';
  const ring = critical ? 'border-[var(--mostar-danger)]/45' : warning ? 'border-[var(--mostar-gold)]/45' : 'border-[var(--mostar-royal-blue)]/50';
  const label = critical ? 'CONDUIT PRESSURE HIGH' : warning ? 'CONDUIT WATCH STATE' : 'CONDUIT FLOW STABLE';
  return (
    <div className="relative flex min-h-[300px] items-center justify-center">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(248,251,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(248,251,255,0.045)_1px,transparent_1px)] bg-[size:36px_36px] opacity-50" />
      <motion.div animate={{ rotate: 360 }} transition={{ duration: critical ? 9 : 24, repeat: Infinity, ease: 'linear' }} className={cx('absolute h-64 w-64 rounded-full border border-dashed', ring)} />
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 36, repeat: Infinity, ease: 'linear' }} className="absolute h-48 w-48 rounded-full border border-white/10" />
      <motion.div animate={{ scale: critical ? [1, 1.07, 0.98, 1] : [1, 1.025, 1] }} transition={{ duration: critical ? 1.35 : 3.8, repeat: Infinity, ease: 'easeInOut' }} className={cx('relative h-44 w-44 rounded-full bg-gradient-to-br p-[1px] shadow-2xl', glow)}>
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[var(--mostar-night-blue)] text-center">
          <Icon name="conduit" className="mb-3 text-[var(--mostar-gold)]" size={30} />
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--mostar-muted)]">Data Conduit</div>
          <div className="mt-1 max-w-[130px] text-sm font-black uppercase leading-tight">{label}</div>
        </div>
      </motion.div>
      <div className="absolute bottom-0 flex flex-wrap justify-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]">
        <span className="mostar-pill-blue rounded-full px-3 py-1">Live Backend Only</span>
        <span className="mostar-status-live rounded-full px-3 py-1">No Mock Data</span>
        <span className="mostar-pill-gold rounded-full px-3 py-1">Truth Visible</span>
      </div>
    </div>
  );
}

export default function SovereignIngestionNode() {
  const [statusText, setStatusText] = useState('loading');
  const [stats, setStats] = useState<Stats>({ total_signals: 0, wins: 0, losses: 0, win_rate: 0, profit_factor: 0, signals_per_day: 0 });
  const [signals, setSignals] = useState<Signal[]>([]);
  const [moedgeSentinel, setMoedgeSentinel] = useState<MoEdgeSentinel | null>(null);
  const [killAnalytics, setKillAnalytics] = useState<KillAnalytics | null>(null);
  const [lastRefresh, setLastRefresh] = useState('—');
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [statusRes, statsRes, signalsRes, moedgeRes, killRes] = await Promise.all([
          fetch('/api/python/status', { cache: 'no-store' }),
          fetch('/api/python/stats', { cache: 'no-store' }),
          fetch('/api/python/signals?limit=10', { cache: 'no-store' }),
          fetch('/api/python/sentinel', { cache: 'no-store' }),
          fetch('/api/python/kill-analytics', { cache: 'no-store' }),
        ]);
        if (statusRes.ok) { const s = await statusRes.json(); setStatusText(String(s.scanner_state || 'unknown')); } else setStatusText('degraded');
        if (statsRes.ok) { const p = await statsRes.json(); setStats({ total_signals: Number(p.total_signals || 0), wins: Number(p.wins || 0), losses: Number(p.losses || 0), win_rate: Number(p.win_rate || 0), profit_factor: Number(p.profit_factor || 0), signals_per_day: Number(p.signals_per_day || 0) }); }
        if (signalsRes.ok) { const p = await signalsRes.json(); setSignals(Array.isArray(p.signals) ? p.signals : []); }
        if (moedgeRes.ok) setMoedgeSentinel(await moedgeRes.json());
        if (killRes.ok) setKillAnalytics(await killRes.json());
        setApiError(!statusRes.ok || !statsRes.ok || !signalsRes.ok || !moedgeRes.ok || !killRes.ok);
        setLastRefresh(new Date().toLocaleTimeString());
      } catch {
        setStatusText('degraded');
        setApiError(true);
        setLastRefresh(new Date().toLocaleTimeString());
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, []);

  const killRate = Number(killAnalytics?.overall?.overall_kill_rate || 0);
  const topGate = killAnalytics?.top_killer_24h?.rejection_gate || 'N/A';
  const topGateKills = Number(killAnalytics?.top_killer_24h?.kill_count_24h || 0);
  const verdict = useMemo(() => {
    if (apiError) return { label: 'Backend degraded', tone: 'text-[#FF8585]', icon: 'alert' as IconName };
    if (moedgeSentinel?.status === 'MOEDGE_PREDICTIVE') return { label: 'Predictive edge detected', tone: 'text-[var(--mostar-success)]', icon: 'shield' as IconName };
    if (moedgeSentinel?.status === 'MOEDGE_MISWEIGHTED') return { label: 'MoEdge misweighted', tone: 'text-[#FF8585]', icon: 'x' as IconName };
    if (moedgeSentinel?.status === 'SYSTEM_EDGE_NEGATIVE') return { label: 'System edge negative', tone: 'text-[var(--mostar-gold)]', icon: 'alert' as IconName };
    return { label: 'Awaiting sentinel truth', tone: 'text-[var(--mostar-gold)]', icon: 'gauge' as IconName };
  }, [apiError, moedgeSentinel?.status]);

  return (
    <AppShell max="max-w-7xl">
      <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mostar-panel rounded-[2rem] p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em]">
              <span className="mostar-pill-blue rounded-full px-3 py-1">MoStar Industries</span><span className="mostar-pill-gold rounded-full px-3 py-1">Sovereign Data Conduit</span><span className={cx('rounded-full px-3 py-1', statusTone(statusText))}>Scanner: {statusText}</span>
            </div>
            <h1 className="text-3xl font-black uppercase tracking-[-0.045em] md:text-5xl">Sovereign Ingestion Node</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--mostar-muted)]">Live backend only. No mock signal feed. This node observes scanner state, MoEdge pressure, gate kills, and latest incoming signals.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-[0.16em] md:grid-cols-3">
            <div className={cx('rounded-2xl px-3 py-2', apiError ? 'mostar-status-danger' : 'mostar-status-live')}>API: {apiError ? 'Degraded' : 'Linked'}</div>
            <div className="mostar-pill-blue rounded-2xl px-3 py-2">Source: Live</div>
            <div className="mostar-pill-white rounded-2xl px-3 py-2">Refresh: {lastRefresh}</div>
          </div>
        </div>
      </motion.header>

      <main className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Conduit Core" subtitle="Motion explains ingestion health. State is never hidden." icon="conduit"><ConduitCore scannerState={statusText} sentinelStatus={moedgeSentinel?.status} killRate={killRate} /></Panel>
        <Panel className="xl:col-span-7" title="Live System Status" subtitle="Scanner truth, paper outcomes, signal velocity." icon="activity">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Metric label="Total Signals" value={fmt(stats.total_signals)} icon="signal" />
            <Metric label="Signals / Day" value={safeFixed(stats.signals_per_day)} tone="text-[#9DB2FF]" icon="radar" />
            <Metric label="Win Rate" value={`${safeFixed(stats.win_rate)}%`} tone="text-[var(--mostar-gold)]" icon="gauge" />
            <Metric label="Wins" value={fmt(stats.wins)} tone="text-[var(--mostar-success)]" icon="check" />
            <Metric label="Losses" value={fmt(stats.losses)} tone="text-[#FF8585]" icon="x" />
            <Metric label="Profit Factor" value={safeFixed(stats.profit_factor)} tone="text-[var(--mostar-gold)]" icon="flame" />
          </div>
        </Panel>

        <Panel className="xl:col-span-4" title="MoEdge Sentinel" subtitle="Predictive edge judgment from live backend." icon="shield">
          {moedgeSentinel ? <div className="space-y-4">
            <div className={cx('flex items-center justify-between rounded-2xl p-3', statusTone(moedgeSentinel.status))}><span className="text-[10px] font-black uppercase tracking-[0.2em]">Status</span><span className="text-xs font-black uppercase">{moedgeSentinel.status}</span></div>
            <div className="grid grid-cols-2 gap-3">{([['00-15 EV', moedgeSentinel.threshold_check['00_15_ev']], ['15-30 EV', moedgeSentinel.threshold_check['15_30_ev']], ['30-45 EV', moedgeSentinel.threshold_check['30_45_ev']], ['45+ EV', moedgeSentinel.threshold_check['45_plus_ev']]] as const).map(([label, value]) => <div key={label} className="mostar-card rounded-2xl p-3"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--mostar-muted)]">{label}</div><div className={cx('mt-1 text-xl font-black', evTone(Number(value)))}>{safeFixed(value, 3)}R</div></div>)}</div>
            <div className="mostar-card rounded-2xl p-4 text-xs leading-relaxed text-[var(--mostar-muted)]">{moedgeSentinel.meaning}</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--mostar-muted)]">Last checked: {safeTs(moedgeSentinel.last_checked)}</div>
          </div> : <div className="mostar-status-warning rounded-2xl p-4 text-sm">MoEdge Sentinel loading or unavailable.</div>}
        </Panel>

        <Panel className="xl:col-span-4" title="CrypSide Kill Analytics" subtitle="Gate pressure and rejection truth." icon="skull">
          {killAnalytics ? <div className="space-y-4">
            <div className={cx('rounded-2xl p-4', killTone(killRate))}><div className="mb-1 text-[10px] font-black uppercase tracking-[0.22em] text-current/70">Overall Kill Rate</div><div className="text-4xl font-black tracking-tight">{pct(killRate)}</div><div className="mt-1 text-[11px] uppercase tracking-[0.15em] text-current/70">{fmt(killAnalytics.overall?.killed_by_gates || 0)} killed / {fmt(killAnalytics.overall?.total_candidates || 0)} candidates</div></div>
            <div className="mostar-card rounded-2xl p-4"><div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--mostar-muted)]">Top Killer 24h</div><div className="mt-2 font-mono text-sm font-black">{topGate}</div><div className="mt-1 text-2xl font-black text-[#FF8585]">{fmt(topGateKills)} kills</div></div>
            {killAnalytics.gate_stats.slice(0, 4).map((gate) => <div key={gate.rejection_gate} className="mostar-card rounded-xl p-3"><div className="mb-2 flex items-center justify-between gap-3"><span className="truncate font-mono text-xs">{gate.rejection_gate}</span><span className="text-xs font-black text-[#FF8585]">{pct(gate.kill_percentage)}</span></div><div className="h-1.5 rounded-full bg-white/10"><div className="h-1.5 rounded-full bg-gradient-to-r from-[var(--mostar-danger)] to-[var(--mostar-gold)]" style={{ width: `${Math.min(Number(gate.kill_percentage || 0), 100)}%` }} /></div></div>)}
          </div> : <div className="mostar-status-warning rounded-2xl p-4 text-sm">Kill analytics loading or unavailable.</div>}
        </Panel>

        <Panel className="xl:col-span-4" title="Conduit Verdict" subtitle="One-line operational truth." icon={verdict.icon}>
          <div className="flex min-h-[250px] flex-col justify-between gap-4"><div className="mostar-card rounded-2xl p-5"><div className="mb-4 flex items-center justify-between gap-3"><div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--mostar-muted)]">Current Verdict</div><Icon name={verdict.icon} className={verdict.tone} size={22} /></div><div className={cx('text-3xl font-black uppercase tracking-tight', verdict.tone)}>{verdict.label}</div></div><div className="mostar-card rounded-2xl p-4 text-sm leading-relaxed text-[var(--mostar-muted)]">Beauty must reveal truth. If the backend is degraded, the node says degraded. No ceremonial masking.</div><div className="grid grid-cols-2 gap-3 text-[10px] font-black uppercase tracking-[0.16em]"><span className="mostar-pill-gold rounded-full px-3 py-2">Execution: Locked</span><span className="mostar-status-live rounded-full px-3 py-2">Observer: Active</span></div></div>
        </Panel>

        <Panel className="xl:col-span-12" title="Latest Live Signals" subtitle="Raw incoming intelligence from /api/python/signals?limit=10." icon="terminal">
          {signals.length === 0 ? <div className="mostar-card rounded-2xl p-5 text-sm font-black uppercase tracking-[0.18em] text-[var(--mostar-muted)]">No live signal data yet.</div> : <div className="overflow-hidden rounded-2xl border border-white/10 bg-[var(--mostar-night-blue)]/55"><div className="grid grid-cols-12 border-b border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--mostar-muted)]"><div className="col-span-3">Side</div><div className="col-span-3">Pair</div><div className="col-span-3">Score</div><div className="col-span-3 text-right">Timestamp</div></div><div className="divide-y divide-white/10 font-mono text-xs">{signals.map((sig, index) => { const id = String(sig.signal_id || sig.id || `${sig.pair}-${sig.ts || sig.timestamp || index}`); const side = String(sig.side || 'UNKNOWN').toUpperCase(); return <motion.div key={id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.025 }} className="grid grid-cols-12 items-center px-4 py-3 hover:bg-[var(--mostar-blue-bg)]"><div className="col-span-3"><span className={cx('rounded-full px-2 py-1 text-[10px] font-black', sideTone(side))}>{side}</span></div><div className="col-span-3 font-black">{sig.pair}</div><div className="col-span-3 text-[var(--mostar-muted)]">{safeFixed(sig.score, 3)}</div><div className="col-span-3 truncate text-right text-[var(--mostar-muted)]">{sig.ts || sig.timestamp || 'n/a'}</div></motion.div>; })}</div></div>}
        </Panel>
      </main>
    </AppShell>
  );
}
