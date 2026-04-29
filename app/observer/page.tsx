// app/observer/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AppShell, Icon, IconName, Metric, Panel, cx, fmt, safeFixed } from '../components/mostarUi';

interface ObserverSignal {
  id: string;
  pair: string;
  timestamp: string;
  side: string;
  entry: number;
  stop_loss: number;
  take_profit: number;
  score: number;
  regime: string;
  outcome?: string;
  r_multiple?: number;
}

interface ObserverStats {
  total_signals: number;
  wins: number;
  losses: number;
  expired: number;
  win_rate: number;
  profit_factor: number;
  signals_per_day: number;
}

function sideClass(side: string) {
  const s = String(side || '').toUpperCase();
  if (s === 'LONG') return 'mostar-status-live';
  if (s === 'SHORT') return 'mostar-status-danger';
  return 'mostar-status-warning';
}

function outcomeClass(outcome?: string) {
  const o = String(outcome || '').toLowerCase();
  if (o.includes('win')) return 'mostar-text-live';
  if (o.includes('loss')) return 'mostar-text-danger';
  if (o.includes('expired')) return 'mostar-text-gold';
  return 'mostar-text-muted';
}

function freshnessTone(seconds: number | null) {
  if (seconds == null) return 'mostar-status-warning';
  if (seconds > 300) return 'mostar-status-danger';
  if (seconds > 60) return 'mostar-status-warning';
  return 'mostar-status-live';
}

function statusTone(active: boolean) {
  return active ? 'mostar-status-live' : 'mostar-status-danger';
}

function scannerTone(state: string) {
  const s = state.toLowerCase();
  if (s.includes('run') || s.includes('active') || s.includes('online')) return 'mostar-status-live';
  if (s.includes('unknown') || s.includes('loading')) return 'mostar-status-warning';
  return 'mostar-status-danger';
}

function ObserverCore({ scannerState, apiConnected, freshnessSeconds, totalSignals }: { scannerState: string; apiConnected: boolean; freshnessSeconds: number | null; totalSignals: number }) {
  const stale = freshnessSeconds == null || freshnessSeconds > 300;
  const critical = !apiConnected || scannerState.toLowerCase().includes('stop') || scannerState.toLowerCase().includes('down');
  const warning = !critical && (stale || scannerState.toLowerCase().includes('unknown'));
  const glow = critical ? 'mostar-core-glow-danger' : warning ? 'mostar-core-glow-warning' : 'mostar-core-glow-live';
  const ring = critical ? 'mostar-core-ring-danger' : warning ? 'mostar-core-ring-warning' : 'mostar-core-ring-live';
  const label = critical ? 'OBSERVER INTERRUPTED' : warning ? 'OBSERVER WATCH STATE' : 'OBSERVER LIVE';

  return (
    <div className="relative flex min-h-[340px] items-center justify-center">
      <div className="mostar-core-grid absolute inset-0 opacity-50" />
      <motion.div animate={{ rotate: 360 }} transition={{ duration: critical ? 8 : 24, repeat: Infinity, ease: 'linear' }} className={cx('absolute h-72 w-72 rounded-full border border-dashed', ring)} />
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 35, repeat: Infinity, ease: 'linear' }} className="mostar-core-orbit absolute h-56 w-56 rounded-full border" />
      <motion.div animate={{ scale: critical ? [1, 1.07, 0.98, 1] : [1, 1.025, 1] }} transition={{ duration: critical ? 1.3 : 3.6, repeat: Infinity, ease: 'easeInOut' }} className={cx('relative h-48 w-48 rounded-full p-[1px] shadow-2xl', glow)}>
        <div className="mostar-core-surface flex h-full w-full flex-col items-center justify-center rounded-full text-center">
          <Icon name="eye" className="mostar-text-gold mb-3" size={32} />
          <div className="mostar-text-muted text-[10px] font-black uppercase tracking-[0.22em]">Idim Ikang</div>
          <div className="mt-1 max-w-[140px] text-sm font-black uppercase leading-tight">{label}</div>
          <div className="mostar-pill mostar-pill-blue mt-3 px-3 py-1 text-[10px]">{fmt(totalSignals)} signals</div>
        </div>
      </motion.div>
      <div className="absolute bottom-0 flex flex-wrap justify-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]">
        <span className={cx('rounded-full px-3 py-1', scannerTone(scannerState))}>Scanner: {scannerState}</span>
        <span className={cx('rounded-full px-3 py-1', statusTone(apiConnected))}>WS: {apiConnected ? 'Connected' : 'Disconnected'}</span>
        <span className={cx('rounded-full px-3 py-1', freshnessTone(freshnessSeconds))}>Fresh: {freshnessSeconds == null ? 'Never' : `${freshnessSeconds}s`}</span>
      </div>
    </div>
  );
}

export default function IdimIkangObserver() {
  const [signals, setSignals] = useState<ObserverSignal[]>([]);
  const [stats, setStats] = useState<ObserverStats>({ total_signals: 0, wins: 0, losses: 0, expired: 0, win_rate: 0, profit_factor: 0, signals_per_day: 0 });
  const [isKilling, setIsKilling] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [scannerState, setScannerState] = useState('unknown');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const wsBase = process.env.NEXT_PUBLIC_API_WS_URL || 'ws://127.0.0.1:8787/ws';

  const loadSnapshot = async () => {
    try {
      const [signalsRes, statsRes, statusRes] = await Promise.all([
        fetch('/api/python/signals?limit=50', { cache: 'no-store' }),
        fetch('/api/python/stats', { cache: 'no-store' }),
        fetch('/api/python/status', { cache: 'no-store' }),
      ]);
      if (signalsRes.ok) {
        const data = await signalsRes.json();
        const rows = Array.isArray(data.signals) ? data.signals : [];
        setSignals(rows.map((d: any, index: number) => ({
          id: String(d.signal_id || d.id || `${d.pair}-${d.ts || d.timestamp || index}`),
          pair: String(d.pair || 'UNKNOWN'),
          timestamp: String(d.ts || d.timestamp || new Date().toISOString()),
          side: String(d.side || 'UNKNOWN'),
          entry: Number(d.entry || 0),
          stop_loss: Number(d.stop_loss || 0),
          take_profit: Number(d.take_profit || 0),
          score: Number(d.score || 0),
          regime: String(d.regime || 'unknown'),
          outcome: d.outcome,
          r_multiple: d.r_multiple != null ? Number(d.r_multiple) : undefined,
        })));
      }
      if (statsRes.ok) {
        const p = await statsRes.json();
        setStats({ total_signals: Number(p.total_signals || 0), wins: Number(p.wins || 0), losses: Number(p.losses || 0), expired: Number(p.expired || 0), win_rate: Number(p.win_rate || 0), profit_factor: Number(p.profit_factor || 0), signals_per_day: Number(p.signals_per_day || 0) });
      }
      if (statusRes.ok) {
        const status = await statusRes.json();
        setScannerState(String(status.scanner_state || 'running'));
      }
      setLastUpdatedAt(Date.now());
    } catch (e) {
      console.error('Observer snapshot load failed', e);
      setScannerState('degraded');
    }
  };

  useEffect(() => {
    void loadSnapshot();
    const timer = setInterval(loadSnapshot, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      ws = new WebSocket(wsBase);
      ws.onopen = () => setApiConnected(true);
      ws.onclose = () => {
        setApiConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'new_signal' && payload.data) {
            const sig = payload.data;
            const newSig: ObserverSignal = {
              id: String(sig.signal_id || sig.id || `${sig.pair}-${sig.ts || sig.timestamp || Date.now()}`),
              pair: String(sig.pair || 'UNKNOWN'),
              timestamp: String(sig.ts || sig.timestamp || new Date().toISOString()),
              side: String(sig.side || 'UNKNOWN'),
              entry: Number(sig.entry || 0),
              stop_loss: Number(sig.stop_loss || 0),
              take_profit: Number(sig.take_profit || 0),
              score: Number(sig.score || 0),
              regime: String(sig.regime || 'unknown'),
            };
            setSignals((prev) => [newSig, ...prev].slice(0, 50));
            setStats((prev) => ({ ...prev, total_signals: prev.total_signals + 1 }));
            setLastUpdatedAt(Date.now());
          }
        } catch (e) {
          console.error('WS parse error', e);
        }
      };
    };
    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [wsBase]);

  const freshnessSeconds = lastUpdatedAt == null ? null : Math.floor((nowMs - lastUpdatedAt) / 1000);
  const latest = signals[0];

  const verdict = useMemo(() => {
    if (!apiConnected) return { label: 'WebSocket disconnected', tone: 'mostar-text-danger', icon: 'alert' as IconName };
    if (freshnessSeconds != null && freshnessSeconds > 300) return { label: 'Observer feed stale', tone: 'mostar-text-danger', icon: 'alert' as IconName };
    if (scannerState.toLowerCase().includes('run')) return { label: 'Observer live and listening', tone: 'mostar-text-live', icon: 'check' as IconName };
    return { label: 'Observer watch state', tone: 'mostar-text-gold', icon: 'gauge' as IconName };
  }, [apiConnected, freshnessSeconds, scannerState]);

  const handleKillSwitch = async () => {
    if (!window.confirm('This will stop the scanner process. Continue?')) return;
    setIsKilling(true);
    try {
      const res = await fetch('/api/python/kill', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(String(err.detail || err.error || 'Kill request failed'));
      }
      setScannerState('stopped');
      await loadSnapshot();
    } catch (error) {
      window.alert(`Kill switch failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsKilling(false);
    }
  };

  return (
    <AppShell>
      <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mostar-panel rounded-[2rem] p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em]">
              <span className="mostar-pill-blue rounded-full px-3 py-1">MoStar Industries</span>
              <span className="mostar-pill-gold rounded-full px-3 py-1">Idim Ikang Observer</span>
              <span className={cx('rounded-full px-3 py-1', scannerTone(scannerState))}>Scanner: {scannerState}</span>
            </div>
            <h1 className="text-3xl font-black uppercase tracking-[-0.045em] md:text-5xl">Idim Ikang Observer</h1>
            <p className="mostar-text-muted mt-2 max-w-3xl text-sm">Live baseline-aligned sovereign scanning with WebSocket pulse, freshness truth, target feed, and explicit kill control.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className={cx('rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em]', freshnessTone(freshnessSeconds))}>Last updated: {freshnessSeconds == null ? 'never' : `${freshnessSeconds}s ago`}</span>
            <button onClick={handleKillSwitch} disabled={isKilling} className={cx('rounded-2xl border px-5 py-2 text-xs font-black uppercase tracking-[0.12em] transition-colors', isKilling ? 'border-white/10 bg-white/5 mostar-text-muted' : 'mostar-status-danger')}>{isKilling ? 'Stopping...' : 'Kill Scanner'}</button>
          </div>
        </div>
      </motion.header>

      <main className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Observer Core" subtitle="Animated state compression for scanner, websocket, and feed freshness." icon="eye">
          <ObserverCore scannerState={scannerState} apiConnected={apiConnected} freshnessSeconds={freshnessSeconds} totalSignals={stats.total_signals} />
        </Panel>

        <Panel className="xl:col-span-7" title="Aggregated Metrics" subtitle="Baseline-aligned observer performance and flow rate." icon="activity">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Metric label="Total Signals" value={fmt(stats.total_signals)} icon="signal" />
            <Metric label="Wins" value={fmt(stats.wins)} tone="mostar-text-live" icon="check" />
            <Metric label="Losses" value={fmt(stats.losses)} tone="mostar-text-danger" icon="x" />
            <Metric label="Win Rate" value={`${safeFixed(stats.win_rate)}%`} tone="mostar-text-gold" icon="gauge" />
            <Metric label="Profit Factor" value={safeFixed(stats.profit_factor)} tone="mostar-text-blue" icon="flame" />
            <Metric label="Sigs / Day" value={safeFixed(stats.signals_per_day, 1)} tone="mostar-text-blue" icon="radar" />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="mostar-card rounded-3xl p-5">
              <div className="mb-3 flex items-center justify-between gap-3"><div className="mostar-text-muted text-[10px] font-black uppercase tracking-[0.22em]">Operational Verdict</div><Icon name={verdict.icon} className={verdict.tone} size={20} /></div>
              <div className={cx('text-2xl font-black uppercase tracking-tight', verdict.tone)}>{verdict.label}</div>
              <p className="mostar-text-muted mt-2 text-xs leading-relaxed">The Observer listens. It does not hide stale feeds, broken WebSockets, or stopped scanner state.</p>
            </div>
            <div className="mostar-card rounded-3xl p-5">
              <div className="mostar-text-muted mb-3 text-[10px] font-black uppercase tracking-[0.22em]">Latest Target Snapshot</div>
              {latest ? (
                <div className="flex items-center justify-between gap-3"><div><div className="text-2xl font-black">{latest.pair}</div><div className="mostar-text-muted mt-1 text-xs">{latest.regime || 'unknown'} · {new Date(latest.timestamp).toLocaleTimeString()}</div></div><span className={cx('rounded-full px-3 py-1 text-[10px] font-black uppercase', sideClass(latest.side))}>{latest.side}</span></div>
              ) : <div className="mostar-text-muted text-sm font-black uppercase tracking-[0.16em]">No live target yet</div>}
            </div>
          </div>
        </Panel>

        <Panel className="xl:col-span-12" title="Live Signals Target Feed" subtitle="WebSocket-enhanced target stream from /api/python/signals?limit=50." icon="terminal">
          <div className="mostar-table-shell overflow-hidden rounded-3xl">
            <div className="mostar-table-head mostar-text-muted hidden grid-cols-12 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] lg:grid">
              <div className="col-span-2">Timestamp</div><div className="col-span-2">Pair</div><div className="col-span-1">Side</div><div className="col-span-1 text-right">Entry</div><div className="col-span-2 text-right">SL / TP</div><div className="col-span-1 text-right">Score</div><div className="col-span-1">Regime</div><div className="col-span-1">Outcome</div><div className="col-span-1 text-right">R-Mult</div>
            </div>
            <div className="divide-y divide-white/10 font-mono text-xs">
              {signals.length === 0 && <div className="mostar-text-muted p-10 text-center text-sm font-black uppercase tracking-[0.18em]">No live signals yet</div>}
              {signals.map((sig, index) => (
                <motion.div key={sig.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.014 }} className="mostar-table-row grid grid-cols-2 gap-3 px-4 py-4 lg:grid-cols-12 lg:items-center lg:gap-0">
                  <div className="mostar-text-muted lg:col-span-2">{new Date(sig.timestamp).toLocaleTimeString()}</div>
                  <div className="font-black lg:col-span-2">{sig.pair}</div>
                  <div className="lg:col-span-1"><span className={cx('rounded-full px-2 py-1 text-[10px] font-black uppercase', sideClass(sig.side))}>{sig.side}</span></div>
                  <div className="text-right lg:col-span-1">{safeFixed(sig.entry)}</div>
                  <div className="mostar-text-muted text-right lg:col-span-2"><span className="mostar-text-danger">{safeFixed(sig.stop_loss)}</span> / <span className="mostar-text-live">{safeFixed(sig.take_profit)}</span></div>
                  <div className="mostar-text-gold text-right lg:col-span-1">{safeFixed(sig.score, 3)}</div>
                  <div className="mostar-text-muted text-[10px] uppercase tracking-[0.12em] lg:col-span-1">{sig.regime}</div>
                  <div className={cx('text-[10px] uppercase tracking-[0.12em] lg:col-span-1', outcomeClass(sig.outcome))}>{sig.outcome || '-'}</div>
                  <div className="mostar-text-muted text-right lg:col-span-1">{sig.r_multiple != null ? safeFixed(sig.r_multiple) : '-'}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </Panel>
      </main>
    </AppShell>
  );
}
