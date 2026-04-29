// app/live/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Icon, IconName, Metric, Panel, cx, fmt, safeFixed } from '../components/mostarUi';

type Signal = { signal_id?: string; id?: string; ts?: string; timestamp?: string; pair: string; side: string; score: number };
type Stats = { total_signals: number; win_rate: number; profit_factor: number; signals_per_day: number };

function statusTone(status: string) {
  const s = status.toLowerCase();
  if (s.includes('run') || s.includes('online') || s.includes('active')) return 'mostar-status-live';
  if (s.includes('degraded') || s.includes('unknown') || s.includes('loading')) return 'mostar-status-warning';
  return 'mostar-status-danger';
}
function sideTone(side: string) {
  const s = side.toUpperCase();
  if (s === 'LONG') return 'mostar-status-live';
  if (s === 'SHORT') return 'mostar-status-danger';
  return 'mostar-status-warning';
}
function metricTone(value: number, mode: 'win' | 'profit' | 'speed') {
  if (mode === 'profit') {
    if (value >= 1.5) return 'text-[var(--mostar-success)]';
    if (value >= 1) return 'text-[var(--mostar-gold)]';
    return 'text-[#FF8585]';
  }
  if (mode === 'win') {
    if (value >= 55) return 'text-[var(--mostar-success)]';
    if (value >= 45) return 'text-[var(--mostar-gold)]';
    return 'text-[#FF8585]';
  }
  return 'text-[#9DB2FF]';
}

function ExecutionCore({ status, signalCount }: { status: string; signalCount: number }) {
  const degraded = status.toLowerCase().includes('degraded') || status.toLowerCase().includes('unknown');
  const critical = status.toLowerCase().includes('down') || status.toLowerCase().includes('stop');
  const ring = critical ? 'border-[var(--mostar-danger)]/45' : degraded ? 'border-[var(--mostar-gold)]/45' : 'border-[var(--mostar-royal-blue)]/50';
  const glow = critical ? 'from-[var(--mostar-danger)] via-[var(--mostar-gold)] to-[var(--mostar-danger)]' : degraded ? 'from-[var(--mostar-gold)] via-[var(--mostar-royal-blue)] to-[var(--mostar-yellow)]' : 'from-[var(--mostar-royal-blue)] via-[var(--mostar-white)] to-[var(--mostar-gold)]';
  const label = critical ? 'EXECUTION WATCH CRITICAL' : degraded ? 'OBSERVER DEGRADED' : 'LIVE OBSERVER STABLE';

  return (
    <div className="relative flex min-h-[330px] items-center justify-center">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(248,251,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(248,251,255,0.045)_1px,transparent_1px)] bg-[size:36px_36px] opacity-50" />
      <motion.div animate={{ rotate: 360 }} transition={{ duration: critical ? 8 : 24, repeat: Infinity, ease: 'linear' }} className={cx('absolute h-72 w-72 rounded-full border border-dashed', ring)} />
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 34, repeat: Infinity, ease: 'linear' }} className="absolute h-56 w-56 rounded-full border border-white/10" />
      <motion.div animate={{ scale: critical ? [1, 1.06, 0.98, 1] : [1, 1.025, 1] }} transition={{ duration: critical ? 1.3 : 3.8, repeat: Infinity, ease: 'easeInOut' }} className={cx('relative h-48 w-48 rounded-full bg-gradient-to-br p-[1px] shadow-2xl', glow)}>
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[var(--mostar-night-blue)] text-center">
          <Icon name="terminal" className="mb-3 text-[var(--mostar-gold)]" size={30} />
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--mostar-muted)]">Live Terminal</div>
          <div className="mt-1 max-w-[140px] text-sm font-black uppercase leading-tight">{label}</div>
          <div className="mt-3 rounded-full border border-[var(--mostar-blue-soft)] bg-[var(--mostar-blue-bg)] px-3 py-1 text-[10px] font-black text-[#9DB2FF]">{fmt(signalCount)} signals</div>
        </div>
      </motion.div>
      <div className="absolute bottom-0 flex flex-wrap justify-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]">
        <span className="mostar-pill-gold rounded-full px-3 py-1">Observer Only</span>
        <span className="mostar-pill-blue rounded-full px-3 py-1">No Execution Simulation</span>
        <span className="mostar-pill-white rounded-full px-3 py-1">Truth Visible</span>
      </div>
    </div>
  );
}

export default function LiveExecutionTerminal() {
  const [statusText, setStatusText] = useState('loading');
  const [stats, setStats] = useState<Stats>({ total_signals: 0, win_rate: 0, profit_factor: 0, signals_per_day: 0 });
  const [signals, setSignals] = useState<Signal[]>([]);
  const [lastRefresh, setLastRefresh] = useState('—');
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [statusRes, statsRes, signalsRes] = await Promise.all([
          fetch('/api/python/status', { cache: 'no-store' }),
          fetch('/api/python/stats', { cache: 'no-store' }),
          fetch('/api/python/signals?limit=25', { cache: 'no-store' }),
        ]);
        if (statusRes.ok) { const s = await statusRes.json(); setStatusText(String(s.scanner_state || 'unknown')); } else setStatusText('degraded');
        if (statsRes.ok) { const p = await statsRes.json(); setStats({ total_signals: Number(p.total_signals || 0), win_rate: Number(p.win_rate || 0), profit_factor: Number(p.profit_factor || 0), signals_per_day: Number(p.signals_per_day || 0) }); }
        if (signalsRes.ok) { const p = await signalsRes.json(); setSignals(Array.isArray(p.signals) ? p.signals : []); }
        setApiError(!statusRes.ok || !statsRes.ok || !signalsRes.ok);
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

  const verdict = useMemo(() => {
    if (apiError) return { label: 'Backend degraded', tone: 'text-[#FF8585]', icon: 'alert' as IconName };
    if (statusText.toLowerCase().includes('run') || statusText.toLowerCase().includes('active')) return { label: 'Live observer linked', tone: 'text-[var(--mostar-success)]', icon: 'check' as IconName };
    return { label: 'Scanner state uncertain', tone: 'text-[var(--mostar-gold)]', icon: 'gauge' as IconName };
  }, [apiError, statusText]);

  const latest = signals[0];

  return (
    <>
      <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mostar-panel rounded-[2rem] p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em]">
              <span className="mostar-pill-blue rounded-full px-3 py-1">MoStar Industries</span>
              <span className="mostar-pill-gold rounded-full px-3 py-1">Sovereign Live Page</span>
              <span className={cx('rounded-full px-3 py-1', statusTone(statusText))}>Scanner: {statusText}</span>
            </div>
            <h1 className="text-3xl font-black uppercase tracking-[-0.045em] md:text-5xl">Live Execution Terminal</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--mostar-muted)]">Observer data only. No execution simulation. The terminal shows live scanner truth, signal velocity, and latest market intelligence.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-[0.16em] md:grid-cols-3">
            <div className={cx('rounded-2xl px-3 py-2', apiError ? 'mostar-status-danger' : 'mostar-status-live')}>API: {apiError ? 'Degraded' : 'Linked'}</div>
            <div className="mostar-pill-gold rounded-2xl px-3 py-2">Execution: Locked</div>
            <div className="mostar-pill-white rounded-2xl px-3 py-2">Refresh: {lastRefresh}</div>
          </div>
        </div>
      </motion.header>

      <main className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Sovereign Terminal Core" subtitle="The terminal heartbeat reflects backend state." icon="crown"><ExecutionCore status={statusText} signalCount={stats.total_signals} /></Panel>
        <Panel className="xl:col-span-7" title="Live Metrics" subtitle="Performance summary from live observer endpoints." icon="activity">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Total Signals" value={fmt(stats.total_signals)} icon="signal" />
            <Metric label="Win Rate" value={`${safeFixed(stats.win_rate)}%`} tone={metricTone(stats.win_rate, 'win')} icon="gauge" />
            <Metric label="Profit Factor" value={safeFixed(stats.profit_factor)} tone={metricTone(stats.profit_factor, 'profit')} icon="flame" />
            <Metric label="Signals / Day" value={safeFixed(stats.signals_per_day)} tone={metricTone(stats.signals_per_day, 'speed')} icon="radar" />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="mostar-card rounded-3xl p-5"><div className="mb-3 flex items-center justify-between gap-3"><div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--mostar-muted)]">Operational Verdict</div><Icon name={verdict.icon} className={verdict.tone} size={20} /></div><div className={cx('text-2xl font-black uppercase tracking-tight', verdict.tone)}>{verdict.label}</div><p className="mt-2 text-xs leading-relaxed text-[var(--mostar-muted)]">The page does not pretend to execute. It observes live scanner data and keeps execution locked.</p></div>
            <div className="mostar-card rounded-3xl p-5"><div className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--mostar-muted)]">Latest Signal Snapshot</div>{latest ? <div className="flex items-center justify-between gap-3"><div><div className="text-2xl font-black">{latest.pair}</div><div className="mt-1 text-xs text-[var(--mostar-muted)]">{latest.ts || latest.timestamp || 'n/a'}</div></div><span className={cx('rounded-full px-3 py-1 text-[10px] font-black uppercase', sideTone(latest.side))}>{latest.side}</span></div> : <div className="text-sm font-black uppercase tracking-[0.16em] text-[var(--mostar-muted)]">No live signal yet</div>}</div>
          </div>
        </Panel>

        <Panel className="xl:col-span-12" title="Latest Signals" subtitle="Raw incoming intelligence from /api/python/signals?limit=25." icon="terminal">
          {signals.length === 0 ? <div className="mostar-status-warning rounded-3xl p-5 text-sm font-black uppercase tracking-[0.18em]">No live data yet.</div> : <div className="overflow-hidden rounded-3xl border border-white/10 bg-[var(--mostar-night-blue)]/55"><div className="grid grid-cols-12 border-b border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--mostar-muted)]"><div className="col-span-3 md:col-span-2">Side</div><div className="col-span-4 md:col-span-3">Pair</div><div className="hidden md:col-span-3 md:block">Score</div><div className="col-span-5 text-right md:col-span-4">Timestamp</div></div><div className="divide-y divide-white/10 font-mono text-xs">{signals.map((sig, index) => { const id = String(sig.signal_id || sig.id || `${sig.pair}-${sig.ts || sig.timestamp || index}`); const side = String(sig.side || 'UNKNOWN').toUpperCase(); return <motion.div key={id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.018 }} className="grid grid-cols-12 items-center px-4 py-3 hover:bg-[var(--mostar-blue-bg)]"><div className="col-span-3 md:col-span-2"><span className={cx('rounded-full px-2 py-1 text-[10px] font-black', sideTone(side))}>{side}</span></div><div className="col-span-4 font-black md:col-span-3">{sig.pair}</div><div className="hidden text-[var(--mostar-muted)] md:col-span-3 md:block">{safeFixed(sig.score, 3)}</div><div className="col-span-5 truncate text-right text-[var(--mostar-muted)] md:col-span-4">{sig.ts || sig.timestamp || 'n/a'}</div></motion.div>; })}</div></div>}
        </Panel>
      </main>
    </>
  );
}
