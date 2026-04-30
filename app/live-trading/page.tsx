'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AppShell, Icon, Metric, Panel, cx, fmt, pct, safeFixed } from '../components/mostarUi';

type GateData = {
  gate_status: string;
  signal_count: number;
  win_rate: number;
  profit_factor: number;
  confidence: number;
  signals_remaining: number;
  pf_gap: number;
  verdict: string;
  mo_lingua: string;
  qseal: string;
};

type StatsData = {
  total_signals: number;
  wins: number;
  losses: number;
  win_rate: number;
  profit_factor: number;
  signals_remaining?: number;
};

type Signal = {
  signal_id?: string; id?: string; ts?: string; timestamp?: string;
  pair: string; side: string; score: number;
  entry?: number; stop_loss?: number; take_profit?: number;
};

type IntentRow = {
  intent_id: string;
  signal_id: string;
  status: string;
  research_only: boolean;
  confidence_gate_eligible: boolean;
};

const EXECUTION_MODES = [
  { key: 'research', label: 'Research', desc: 'Historical analysis only. No paper or live trades.', active: true, locked: false },
  { key: 'paper', label: 'Paper', desc: 'Simulated trades on live market data. No real money.', active: false, locked: false },
  { key: 'live_locked', label: 'Live Locked', desc: 'Gate not cleared. Live execution blocked.', active: false, locked: true },
  { key: 'live_armed', label: 'Live Armed', desc: 'Gate cleared + manual approval required.', active: false, locked: true },
  { key: 'live_active', label: 'Live Active', desc: 'Execution live. Manual approval required per symbol.', active: false, locked: true },
];

const RISK_CONTROLS = [
  { label: 'Max Daily Loss', value: '2%', locked: true },
  { label: 'Max Position Size', value: '1% of account', locked: true },
  { label: 'Max Open Positions', value: '3', locked: true },
  { label: 'Allowed Leverage', value: '3× max', locked: true },
  { label: 'Cooldown After Loss', value: '4h', locked: true },
  { label: 'Kill Switch', value: 'ARMED', locked: false, danger: true },
];

const EXCHANGES = [
  { id: 'binance', name: 'Binance Futures', type: 'USD-M Futures' },
  { id: 'bybit', name: 'Bybit Futures', type: 'USDT Perp' },
  { id: 'gate', name: 'Gate.io Futures', type: 'USDT Perp' },
];

function GateRing({ gateStatus, pct: gPct }: { gateStatus: string; pct: number }) {
  const locked = gateStatus === 'LOCKED';
  const open = gateStatus === 'OPEN';
  const glow = locked
    ? 'from-[var(--mostar-danger)] via-[var(--mostar-gold)] to-[var(--mostar-danger)]'
    : open
    ? 'from-[var(--mostar-success)] via-[var(--mostar-royal-blue)] to-[var(--mostar-success)]'
    : 'from-[var(--mostar-gold)] via-[var(--mostar-royal-blue)] to-[var(--mostar-gold)]';
  const ring = locked
    ? 'border-[var(--mostar-danger)]/45'
    : open
    ? 'border-[var(--mostar-success)]/45'
    : 'border-[var(--mostar-gold)]/45';

  return (
    <div className="relative flex min-h-[280px] items-center justify-center">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(248,251,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(248,251,255,0.04)_1px,transparent_1px)] bg-[size:36px_36px] opacity-50" />
      <motion.div animate={{ rotate: 360 }} transition={{ duration: locked ? 10 : 40, repeat: Infinity, ease: 'linear' }} className={cx('absolute h-60 w-60 rounded-full border border-dashed', ring)} />
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 52, repeat: Infinity, ease: 'linear' }} className="absolute h-44 w-44 rounded-full border border-white/10" />
      <motion.div animate={{ scale: locked ? [1, 1.05, 0.97, 1] : [1, 1.02, 1] }} transition={{ duration: locked ? 1.5 : 4, repeat: Infinity, ease: 'easeInOut' }} className={cx('relative h-40 w-40 rounded-full bg-gradient-to-br p-[1px] shadow-2xl', glow)}>
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[var(--mostar-night-blue)] text-center">
          <Icon name="lock" className={locked ? 'text-[#FF8585] mb-2' : 'text-[var(--mostar-success)] mb-2'} size={28} />
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--mostar-muted)]">Gate</div>
          <div className="mt-1 text-sm font-black uppercase leading-tight">{gateStatus}</div>
          <div className="mt-1 text-xs text-[var(--mostar-muted)]">{gPct.toFixed(0)}% filled</div>
        </div>
      </motion.div>
    </div>
  );
}

export default function LiveTradingCockpit() {
  const [gate, setGate] = useState<GateData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [lastRefresh, setLastRefresh] = useState('—');
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [gateRes, statsRes, sigRes] = await Promise.all([
          fetch('/api/python/confidence-gate', { cache: 'no-store' }),
          fetch('/api/python/stats', { cache: 'no-store' }),
          fetch('/api/python/signals?limit=25', { cache: 'no-store' }),
        ]);
        if (gateRes.ok) {
          const g = await gateRes.json();
          if (g.data_source !== 'error') setGate(g);
        }
        if (statsRes.ok) {
          const s = await statsRes.json();
          setStats(s);
        }
        if (sigRes.ok) {
          const s = await sigRes.json();
          setSignals(Array.isArray(s.signals) ? s.signals : []);
        }
        setApiError(!gateRes.ok && !statsRes.ok);
        setLastRefresh(new Date().toLocaleTimeString());
      } catch {
        setApiError(true);
        setLastRefresh(new Date().toLocaleTimeString());
      }
    };
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, []);

  const gatePct = gate
    ? Math.min((gate.signal_count / Math.max(200 - gate.signals_remaining + gate.signal_count, 200)) * 100, 100)
    : 0;
  const gateStatus = gate?.gate_status ?? 'LOCKED';
  const signalsResolved = gate?.signal_count ?? 0;
  const signalsNeeded = gate?.signals_remaining ?? 200;

  return (
    <AppShell max="max-w-7xl">
      {/* Header */}
      <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mostar-panel rounded-[2rem] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em]">
              <span className="mostar-pill-blue rounded-full px-3 py-1">MoStar Industries</span>
              <span className="mostar-pill-gold rounded-full px-3 py-1">Live Trading Cockpit</span>
              <span className="mostar-status-danger rounded-full px-3 py-1">EXECUTION LOCKED</span>
            </div>
            <h1 className="text-3xl font-black uppercase tracking-[-0.045em] md:text-5xl">Live Trading</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--mostar-muted)]">
              Live execution unavailable until Confidence Gate clears and manual approval is given.
              This cockpit is read-only. No orders will be placed.
            </p>
          </div>
          <div className="mostar-pill-white rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em]">Refresh: {lastRefresh}</div>
        </div>
      </motion.header>

      <main className="grid grid-cols-1 gap-6 xl:grid-cols-12">

        {/* Confidence Gate ring */}
        <Panel className="xl:col-span-4" title="Confidence Gate" subtitle="Live execution locked until gate clears." icon="shield">
          <GateRing gateStatus={gateStatus} pct={gatePct} />
        </Panel>

        {/* Gate metrics */}
        <Panel className="xl:col-span-8" title="Gate Status" subtitle="200 eligible resolved paper signals + PF ≥ 1.30 required." icon="gauge">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Metric label="Resolved Signals" value={fmt(signalsResolved)} icon="signal" sub={`${fmt(signalsNeeded)} remaining`} />
            <Metric label="Win Rate" value={gate ? `${safeFixed(gate.win_rate)}%` : '—'} tone="text-[var(--mostar-gold)]" icon="gauge" sub="Need sustained data" />
            <Metric label="Profit Factor" value={gate ? safeFixed(gate.profit_factor) : '—'} tone={gate && gate.profit_factor >= 1.3 ? 'text-[var(--mostar-success)]' : 'text-[#FF8585]'} icon="activity" sub="Target: 1.30" />
            <Metric label="Confidence" value={gate ? `${safeFixed(gate.confidence, 1)}%` : '—'} tone="text-[#9DB2FF]" icon="radar" sub="Target: 95%" />
            <Metric label="PF Gap" value={gate ? safeFixed(gate.pf_gap) : '—'} tone="text-[var(--mostar-muted)]" icon="flame" sub="Distance to 1.30" />
            <div className="mostar-status-danger rounded-3xl border p-4">
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-current/70">Gate Verdict</div>
              <div className="text-sm font-black leading-snug">{gate?.verdict ?? 'Gate locked. Collecting paper truth.'}</div>
            </div>
          </div>
          {gate && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-[var(--mostar-night-blue)]/60 p-4 font-mono text-xs text-[var(--mostar-muted)]">
              {gate.mo_lingua} <span className="ml-2">{gate.qseal}</span>
            </div>
          )}
        </Panel>

        {/* Execution mode */}
        <Panel className="xl:col-span-6" title="Execution Mode" subtitle="Current mode is Research. Live modes are locked." icon="lock">
          <div className="space-y-2">
            {EXECUTION_MODES.map((mode) => (
              <div key={mode.key} className={cx(
                'flex items-center justify-between rounded-2xl border p-3',
                mode.key === 'research' ? 'mostar-status-live' : mode.locked ? 'border-white/10 bg-white/[0.02] opacity-50' : 'mostar-status-warning'
              )}>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.18em]">{mode.label}</div>
                  <div className="mt-0.5 text-[10px] text-current/70">{mode.desc}</div>
                </div>
                {mode.locked
                  ? <Icon name="lock" size={14} className="text-current/50 shrink-0" />
                  : mode.key === 'research'
                  ? <Icon name="check" size={14} className="shrink-0" />
                  : null}
              </div>
            ))}
          </div>
        </Panel>

        {/* Live Signal Feed */}
        <Panel className="xl:col-span-5" title="Live Signal Feed" subtitle="Select a signal to prepare exchange dockets" icon="activity">
          <div className="flex h-[400px] flex-col gap-2 overflow-y-auto pr-1">
            {signals.length === 0 ? (
              <div className="mostar-text-muted text-xs p-4">No live signals available.</div>
            ) : (
              signals.map(s => {
                const id = s.signal_id || s.id || `${s.pair}-${s.ts}`;
                const isSelected = selectedSignal?.pair === s.pair && selectedSignal?.ts === s.ts;
                return (
                  <button
                    key={id}
                    onClick={() => setSelectedSignal(s)}
                    className={cx(
                      'flex w-full cursor-pointer flex-col gap-2 rounded-2xl border p-3 text-left transition-colors',
                      isSelected ? 'border-[var(--mostar-gold)]/50 bg-[var(--mostar-gold)]/10' : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{s.pair}</span>
                        <span className={cx('text-[10px] font-black uppercase px-2 py-0.5 rounded-full', s.side === 'LONG' ? 'mostar-status-live' : 'mostar-status-danger')}>{s.side}</span>
                      </div>
                      <span className="font-mono text-xs mostar-text-gold">{safeFixed(s.score, 1)}</span>
                    </div>
                    <div className="text-[10px] text-[var(--mostar-muted)] font-mono flex justify-between">
                      <span>{s.ts || s.timestamp}</span>
                      <span>{s.entry ? `EP: ${safeFixed(s.entry, 4)}` : ''}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Panel>

        {/* Exchange Dockets */}
        <Panel className="xl:col-span-7" title="Exchange Dockets" subtitle="Auto-populated execution parameters" icon="terminal">
          <div className="space-y-4">
            {EXCHANGES.map(ex => (
              <div key={ex.id} className="mostar-card rounded-2xl p-4">
                <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-black">{ex.name}</span>
                    <span className="text-[10px] text-[var(--mostar-muted)] px-2 py-0.5 bg-white/5 rounded-full">{ex.type}</span>
                  </div>
                </div>

                {!selectedSignal ? (
                  <div className="py-6 text-center text-xs font-black uppercase tracking-[0.2em] text-[var(--mostar-muted)]">
                    Awaiting Signal Selection
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                    <div><span className="text-[var(--mostar-muted)] block mb-1">Pair</span><span className="font-black text-sm">{selectedSignal.pair}</span></div>
                    <div><span className="text-[var(--mostar-muted)] block mb-1">Side</span><span className={cx('font-black text-sm', selectedSignal.side === 'LONG' ? 'mostar-text-live' : 'mostar-text-danger')}>{selectedSignal.side}</span></div>
                    <div><span className="text-[var(--mostar-muted)] block mb-1">Entry Price</span><span>{selectedSignal.entry ? safeFixed(selectedSignal.entry, 4) : 'Market'}</span></div>
                    <div><span className="text-[var(--mostar-muted)] block mb-1">Take Profit</span><span className="mostar-text-live">{selectedSignal.take_profit ? safeFixed(selectedSignal.take_profit, 4) : '—'}</span></div>
                    <div><span className="text-[var(--mostar-muted)] block mb-1">Stop Loss</span><span className="mostar-text-danger">{selectedSignal.stop_loss ? safeFixed(selectedSignal.stop_loss, 4) : '—'}</span></div>
                    <div><span className="text-[var(--mostar-muted)] block mb-1">Score</span><span className="mostar-text-gold">{safeFixed(selectedSignal.score, 1)}</span></div>
                    <div className="col-span-2 mt-2">
                      <button disabled className="w-full rounded-xl bg-[var(--mostar-danger)]/10 border border-[var(--mostar-danger)]/30 py-3 text-center text-[10px] font-black uppercase tracking-[0.2em] text-[#FF8585] opacity-80 cursor-not-allowed">
                        Confidence Gate Locked
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>

        {/* Risk controls */}
        <Panel className="xl:col-span-5" title="Risk Controls" subtitle="Immutable until manual override is approved." icon="shield">
          <div className="space-y-2">
            {RISK_CONTROLS.map((r) => (
              <div key={r.label} className={cx(
                'flex items-center justify-between rounded-2xl p-3',
                r.danger ? 'mostar-status-danger' : 'mostar-card'
              )}>
                <span className="text-xs font-black uppercase tracking-[0.15em]">{r.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black">{r.value}</span>
                  {r.locked && <Icon name="lock" size={12} className="text-[var(--mostar-muted)]" />}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Paper orders summary */}
        <Panel className="xl:col-span-7" title="Paper Performance" subtitle="Resolved paper trade outcomes from scanner signals." icon="activity">
          {!stats ? (
            <div className="mostar-status-warning rounded-2xl p-4 text-sm">Loading paper performance...</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Metric label="Total Signals" value={fmt(stats.total_signals)} icon="signal" />
              <Metric label="Wins" value={fmt(stats.wins)} tone="text-[var(--mostar-success)]" icon="check" />
              <Metric label="Losses" value={fmt(stats.losses)} tone="text-[#FF8585]" icon="x" />
              <Metric label="Win Rate" value={`${safeFixed(stats.win_rate)}%`} tone="text-[var(--mostar-gold)]" icon="gauge" />
              <Metric label="Profit Factor" value={safeFixed(stats.profit_factor)} tone={stats.profit_factor >= 1.3 ? 'text-[var(--mostar-success)]' : 'text-[#FF8585]'} icon="flame" />
              <div className="mostar-card rounded-3xl p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--mostar-muted)] mb-2">Resolved</div>
                <div className="text-2xl font-black tracking-tight">{fmt(stats.wins + stats.losses)}</div>
                <div className="text-[11px] text-[var(--mostar-muted)] mt-1">of {fmt(stats.total_signals)} signals</div>
              </div>
            </div>
          )}
        </Panel>

        {/* Live orders — locked */}
        <Panel className="xl:col-span-12" title="Live Orders" subtitle="Disabled. Live execution unavailable until gate clears and manual approval is given." icon="lock">
          <div className="flex min-h-[120px] items-center justify-center rounded-2xl border border-[var(--mostar-danger)]/25 bg-[var(--mostar-danger)]/5">
            <div className="text-center">
              <Icon name="lock" size={32} className="mx-auto mb-3 text-[#FF8585]" />
              <div className="text-sm font-black uppercase tracking-[0.2em] text-[#FF8585]">Live Execution Locked</div>
              <div className="mt-2 max-w-md text-[11px] text-[var(--mostar-muted)]">
                Gate requires {fmt(signalsNeeded)} more eligible resolved paper signals with PF ≥ 1.30.
                Then manual approval by operator is required before any live order can be placed.
              </div>
            </div>
          </div>
        </Panel>

        {/* Audit doctrine */}
        <Panel className="xl:col-span-12" title="Covenant Doctrine" subtitle="The machine does not gamble. It earns the right to act." icon="scroll">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="mostar-card rounded-2xl p-4 text-xs leading-relaxed text-[var(--mostar-muted)]">
              <div className="mb-2 font-black uppercase tracking-[0.18em] text-[var(--mostar-gold)]">Gate Covenant</div>
              200+ eligible resolved paper signals with profit factor ≥ 1.30 and 95% statistical confidence required before any live execution is considered.
            </div>
            <div className="mostar-card rounded-2xl p-4 text-xs leading-relaxed text-[var(--mostar-muted)]">
              <div className="mb-2 font-black uppercase tracking-[0.18em] text-[var(--mostar-gold)]">Manual Approval</div>
              Gate clearing does not automatically unlock execution. A manual operator approval step is required. The machine waits. The hand decides.
            </div>
            <div className="mostar-card rounded-2xl p-4 text-xs leading-relaxed text-[var(--mostar-muted)]">
              <div className="mb-2 font-black uppercase tracking-[0.18em] text-[var(--mostar-gold)]">Research Only</div>
              Historical training results do not count toward the live gate. Only forward live paper signals with confidence_gate_eligible=true and research_only=false are counted.
            </div>
          </div>
        </Panel>

      </main>
    </AppShell>
  );
}
