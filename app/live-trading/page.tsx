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
  mode?: string;
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

const EXCHANGES = [
  { id: 'binance', name: 'Binance', type: 'USD-M', mode: 'testnet' },
  { id: 'bybit', name: 'Bybit', type: 'USDT Perp', mode: 'demo' },
  { id: 'gate', name: 'Gate.io', type: 'USDT Perp', mode: 'simulated' },
  { id: 'okx', name: 'OkX', type: 'USDT Perp', mode: 'demo' },
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
    <div className="relative flex min-h-[160px] items-center justify-center scale-[0.70] -my-6">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(248,251,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(248,251,255,0.04)_1px,transparent_1px)] bg-[size:36px_36px] opacity-50" />
      <motion.div animate={{ rotate: 360 }} transition={{ duration: locked ? 10 : 40, repeat: Infinity, ease: 'linear' }} className={cx('absolute h-60 w-60 rounded-full border border-dashed', ring)} />
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 52, repeat: Infinity, ease: 'linear' }} className="absolute h-44 w-44 rounded-full border border-white/10" />
      <motion.div animate={{ scale: locked ? [1, 1.05, 0.97, 1] : [1, 1.02, 1] }} transition={{ duration: locked ? 1.5 : 4, repeat: Infinity, ease: 'easeInOut' }} className={cx('relative h-40 w-40 rounded-full bg-gradient-to-br p-[1px] shadow-2xl', glow)}>
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[var(--mostar-night-blue)] text-center">
          <Icon name="lock" className={locked ? 'text-[#FF8585] mb-2' : 'text-[var(--mostar-success)] mb-2'} size={28} />
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--mostar-muted)]">Gate</div>
          <div className="mt-1 text-sm font-black uppercase leading-tight">{gateStatus}</div>
          <div className="mt-1 text-xs text-[var(--mostar-muted)]">{gPct.toFixed(0)}%</div>
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
  const [selectedVenue, setSelectedVenue] = useState(EXCHANGES[0].id);
  const [lastRefresh, setLastRefresh] = useState('—');

  useEffect(() => {
    const load = async () => {
      try {
        const [gateRes, statsRes, sigRes] = await Promise.all([
          fetch('/api/python/confidence-gate', { cache: 'no-store' }),
          fetch('/api/python/stats', { cache: 'no-store' }),
          fetch('/api/python/signals?limit=50', { cache: 'no-store' }),
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
        setLastRefresh(new Date().toLocaleTimeString());
      } catch {
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
  
  // Unified Status Strip Logic
  const execMode = gate?.mode === 'LIVE_DEMO' ? 'LIVE DEMO (ARMED)' : gateStatus === 'OPEN' ? 'PRODUCTION (ARMED)' : 'LOCKED';
  const execModeColor = gateStatus === 'OPEN' || gate?.mode === 'LIVE_DEMO' ? 'text-green-400' : 'text-red-400';
  const activeExchange = EXCHANGES.find(ex => ex.id === selectedVenue) ?? EXCHANGES[0];
  const entryPrice = selectedSignal?.entry ?? null;
  const stopPrice = selectedSignal?.stop_loss ?? null;
  const targetPrice = selectedSignal?.take_profit ?? null;
  const orderNotional = 100;
  const estimatedQty = entryPrice ? orderNotional / entryPrice : null;
  const canDeploy = Boolean(selectedSignal && (gateStatus === 'OPEN' || gate?.mode === 'LIVE_DEMO'));

  async function deployToVenue(exchangeId: string) {
    if (!selectedSignal) return;

    try {
      const res = await fetch('/api/python/execution/demo-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange: exchangeId,
          signal_id: selectedSignal.id || selectedSignal.signal_id,
          symbol: selectedSignal.pair,
          side: selectedSignal.side,
          demo: true,
          manual_approval: true,
        }),
      });
      const result = await res.json();
      console.log('Venue deploy result:', result);
      alert(`Submitted ${selectedSignal.pair} to ${exchangeId}.`);
    } catch (e) {
      alert(`Error deploying: ${e}`);
    }
  }

  async function deployToAllVenues() {
    if (!selectedSignal) return;

    try {
      // Parallel execution for fan-out
      const promises = EXCHANGES.map(ex => 
        fetch('/api/python/execution/demo-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exchange: ex.id,
            signal_id: selectedSignal.id || selectedSignal.signal_id,
            symbol: selectedSignal.pair,
            side: selectedSignal.side,
            demo: true,
            manual_approval: true,
          }),
        }).then(res => res.json())
      );

      const results = await Promise.all(promises);
      console.log('Fan-out results:', results);
      alert(`Successfully deployed to all ${EXCHANGES.length} venues.`);
    } catch (e) {
      alert(`Error deploying: ${e}`);
    }
  }

  return (
    <AppShell max="max-w-none" fullScreen>
      {/* Unified Status Strip Header */}
      <motion.header 
        initial={{ opacity: 0, y: -12 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="flex-none mb-2 flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3 shadow-lg"
      >
        <div className="flex flex-wrap items-center gap-4 md:gap-6 text-[10px] font-black uppercase tracking-[0.2em]">
          <div className="flex items-center gap-2 text-white">
            <Icon name="terminal" size={14} className="text-[var(--mostar-gold)]" />
            <span className="hidden md:inline">Live Trading Cockpit</span>
          </div>
          <div className="hidden h-4 w-[1px] bg-white/20 md:block" />
          <div className={cx('flex items-center gap-2', execModeColor)}>
            EXECUTION: {execMode}
          </div>
          <div className="h-4 w-[1px] bg-white/20" />
          <div className="flex items-center gap-2 text-zinc-400">
            OBSERVER: <span className="text-blue-400">ACTIVE</span>
          </div>
          <div className="h-4 w-[1px] bg-white/20" />
          <div className="flex items-center gap-2 text-zinc-400">
            GATE: <span className={gate?.gate_data_source === 'missing_paper_orders' ? 'text-red-400' : 'text-white'}>
              {gate?.gate_data_source === 'missing_paper_orders' ? '0/200' : `${signalsResolved}/200`}
            </span>
          </div>
          <div className="hidden h-4 w-[1px] bg-white/20 xl:block" />
          <div className="hidden items-center gap-2 text-zinc-400 xl:flex">
            RISK LIMIT: <span className="text-white">2% LOSS · 3× LEV</span>
          </div>
        </div>
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
          {lastRefresh}
        </div>
      </motion.header>

      {/* Missing Data Source Warning */}
      {gate?.gate_data_source === 'missing_paper_orders' && (
        <motion.div 
          initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
          className="flex-none mb-4 rounded-xl border border-red-500/50 bg-red-500/20 px-4 py-3 text-red-200 text-xs font-bold text-center tracking-wide"
        >
          🚨 DATABASE DISCONNECT: {gate.gate_warning || "paper_orders table is not provisioned. Execution metrics are suppressed."}
        </motion.div>
      )}

      {/* 3-Column Terminal Architecture */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 min-h-0">
        
        {/* Left Column - System State */}
        <div className="col-span-1 md:col-span-4 xl:col-span-3 flex flex-col gap-4 min-h-0">
          <Panel className="flex-none flex flex-col" title="System State">
            <GateRing gateStatus={gateStatus} pct={gatePct} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1">Win Rate</div>
                <div className="text-lg font-black text-[var(--mostar-gold)]">{gate ? `${safeFixed(gate.win_rate)}%` : '—'}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1">Profit Factor</div>
                <div className={cx('text-lg font-black', gate && gate.profit_factor >= 1.3 ? 'text-[var(--mostar-success)]' : 'text-[#FF8585]')}>
                  {gate ? safeFixed(gate.profit_factor) : '—'}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1">Confidence</div>
                <div className="text-lg font-black text-[#9DB2FF]">{gate ? `${safeFixed(gate.confidence, 1)}%` : '—'}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1">Gate Gap</div>
                <div className="text-lg font-black text-zinc-300">{gate ? safeFixed(gate.pf_gap) : '—'}</div>
              </div>
            </div>
            {gate && (
              <div className="mt-3 rounded-lg bg-black/50 p-2 text-[10px] font-mono text-[var(--mostar-muted)] text-center">
                {gate.mo_lingua} <span className="ml-1">{gate.qseal}</span>
              </div>
            )}
          </Panel>

          <Panel className="flex-1 flex flex-col min-h-0" title="Paper Performance">
            <div className="flex-1 overflow-y-auto pr-2">
              {!stats ? (
                <div className="text-xs text-zinc-500">Loading...</div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between items-center rounded-lg bg-white/5 p-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Total Signals</span>
                    <span className="font-mono text-xs font-bold text-white">{fmt(stats.total_signals)}</span>
                  </div>
                  <div className="flex justify-between items-center rounded-lg bg-white/5 p-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Wins</span>
                    <span className="font-mono text-xs font-bold text-[var(--mostar-success)]">{fmt(stats.wins)}</span>
                  </div>
                  <div className="flex justify-between items-center rounded-lg bg-white/5 p-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Losses</span>
                    <span className="font-mono text-xs font-bold text-[#FF8585]">{fmt(stats.losses)}</span>
                  </div>
                  <div className="flex justify-between items-center rounded-lg bg-white/5 p-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Win Rate</span>
                    <span className="font-mono text-xs font-bold text-[var(--mostar-gold)]">{safeFixed(stats.win_rate)}%</span>
                  </div>
                  <div className="flex justify-between items-center rounded-lg bg-white/5 p-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Profit Factor</span>
                    <span className={cx('font-mono text-xs font-bold', stats.profit_factor >= 1.3 ? 'text-[var(--mostar-success)]' : 'text-[#FF8585]')}>{safeFixed(stats.profit_factor)}</span>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* Center Column - Market Feed */}
        <div className="col-span-1 md:col-span-8 xl:col-span-6 flex flex-col min-h-0">
          <Panel className="flex-1 flex flex-col min-h-0" title="Live Signal Feed" subtitle="Select a signal to fill the order ticket" icon="activity">
            <div className="flex-1 overflow-y-auto pr-2 space-y-2">
              {signals.length === 0 ? (
                <div className="text-xs text-zinc-500 text-center py-10">No live signals available.</div>
              ) : (
                signals.map(s => {
                  const id = s.signal_id || s.id || `${s.pair}-${s.ts}`;
                  const isSelected = selectedSignal?.pair === s.pair && selectedSignal?.ts === s.ts;
                  return (
                    <button
                      key={id}
                      onClick={() => setSelectedSignal(s)}
                      className={cx(
                        'flex w-full cursor-pointer flex-row items-center justify-between gap-4 rounded-xl border p-3 text-left transition-colors',
                        isSelected ? 'border-[var(--mostar-gold)]/50 bg-[var(--mostar-gold)]/10' : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                      )}
                    >
                      <div className="flex items-center gap-3 w-1/3">
                        <span className={cx('text-[10px] font-black uppercase w-12 text-center rounded-sm', s.side === 'LONG' ? 'bg-[var(--mostar-success)]/20 text-[var(--mostar-success)]' : 'bg-[#FF8585]/20 text-[#FF8585]')}>
                          {s.side}
                        </span>
                        <span className="font-bold text-sm tracking-tight">{s.pair}</span>
                      </div>
                      
                      <div className="flex-1 flex justify-around font-mono text-[11px] text-zinc-400">
                        <span>{s.entry ? `EP: ${safeFixed(s.entry, 4)}` : 'Market'}</span>
                        <span className="text-[var(--mostar-gold)]">S: {safeFixed(s.score, 1)}</span>
                      </div>

                      <div className="text-[10px] text-zinc-500 font-mono text-right w-1/4">
                        {s.ts || s.timestamp}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Panel>
        </div>

        {/* Right Column - Exchange Order Entry */}
        <div className="col-span-1 md:col-span-12 xl:col-span-3 flex flex-col gap-4 min-h-0">
          <Panel className="flex-1 flex flex-col min-h-0" title="Trading Panel" subtitle="Signal-filled order ticket" icon="terminal">
            <div className="flex-1 overflow-y-auto pr-2">
              <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
                {EXCHANGES.map(ex => {
                  const active = ex.id === activeExchange.id;
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => setSelectedVenue(ex.id)}
                      className={cx(
                        'min-h-10 rounded-lg px-2 text-[9px] font-black uppercase tracking-[0.12em] transition-colors',
                        active
                          ? 'bg-white/12 text-white shadow-inner'
                          : 'text-zinc-500 hover:bg-white/6 hover:text-zinc-300'
                      )}
                    >
                      {ex.name}
                    </button>
                  );
                })}
              </div>

              <div className="mb-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/35 px-3 py-2">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">{activeExchange.type}</div>
                  <div className="mt-0.5 text-xs font-black text-white">{activeExchange.name} Futures</div>
                </div>
                <div className="rounded-md border border-[var(--mostar-success)]/25 bg-[var(--mostar-success)]/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[var(--mostar-success)]">
                  {activeExchange.mode}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Symbol</span>
                    <span className="font-mono text-[10px] text-zinc-500">Perpetual</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-lg font-black text-white">{selectedSignal?.pair ?? 'Select Signal'}</span>
                    <span className={cx(
                      'rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em]',
                      selectedSignal?.side === 'SHORT'
                        ? 'bg-[#FF8585]/15 text-[#FF8585]'
                        : selectedSignal?.side === 'LONG'
                        ? 'bg-[var(--mostar-success)]/15 text-[var(--mostar-success)]'
                        : 'bg-white/5 text-zinc-600'
                    )}>
                      {selectedSignal?.side ?? 'No Side'}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Order Type</div>
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1">
                    <span className="rounded-md bg-white/10 px-2 py-1.5 text-center text-[10px] font-black text-white">Market</span>
                    <span className="px-2 py-1.5 text-center text-[10px] font-black text-zinc-600">Limit</span>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Margin</div>
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1">
                    <span className="rounded-md bg-white/10 px-2 py-1.5 text-center text-[10px] font-black text-white">Cross</span>
                    <span className="px-2 py-1.5 text-center text-[10px] font-black text-zinc-600">3x</span>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Entry</div>
                  <div className="mt-2 font-mono text-sm font-black text-white">{entryPrice ? safeFixed(entryPrice, 4) : 'Market'}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Notional</div>
                  <div className="mt-2 font-mono text-sm font-black text-white">{selectedSignal ? `${safeFixed(orderNotional, 2)} USDT` : '—'}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Est. Qty</div>
                  <div className="mt-2 font-mono text-sm font-black text-white">{estimatedQty ? safeFixed(estimatedQty, 4) : '—'}</div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">Signal Score</div>
                  <div className="mt-2 font-mono text-sm font-black text-[var(--mostar-gold)]">{selectedSignal ? safeFixed(selectedSignal.score, 1) : '—'}</div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="mb-2 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">
                  <span>TP / SL</span>
                  <span>Read-only from signal</span>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div className="rounded-lg bg-[var(--mostar-success)]/10 p-2 text-[var(--mostar-success)]">
                    <div className="mb-1 text-[9px] font-black uppercase tracking-[0.16em] opacity-70">Take Profit</div>
                    <div className="font-black">{targetPrice ? safeFixed(targetPrice, 4) : '—'}</div>
                  </div>
                  <div className="rounded-lg bg-[#FF8585]/10 p-2 text-[#FF8585]">
                    <div className="mb-1 text-[9px] font-black uppercase tracking-[0.16em] opacity-70">Stop Loss</div>
                    <div className="font-black">{stopPrice ? safeFixed(stopPrice, 4) : '—'}</div>
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">Gate</div>
                    <div className={cx('mt-1 text-xs font-black', canDeploy ? 'text-[var(--mostar-success)]' : 'text-[#FF8585]')}>{gateStatus}</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">Route</div>
                    <div className="mt-1 text-xs font-black text-white">{activeExchange.name}</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500">Mode</div>
                    <div className="mt-1 text-xs font-black text-[var(--mostar-gold)]">{gate?.mode === 'LIVE_DEMO' ? 'Demo' : 'Live'}</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => void deployToVenue(activeExchange.id)}
                  disabled={!canDeploy}
                  className={cx(
                    'w-full rounded-xl py-3 text-xs font-black uppercase tracking-[0.18em] transition-all',
                    canDeploy
                      ? selectedSignal?.side === 'SHORT'
                        ? 'border border-[#FF8585]/35 bg-[#FF8585]/12 text-[#FF8585] hover:bg-[#FF8585]/18'
                        : 'border border-[var(--mostar-success)]/35 bg-[var(--mostar-success)]/12 text-[var(--mostar-success)] hover:bg-[var(--mostar-success)]/18'
                      : 'cursor-not-allowed border border-white/5 bg-zinc-800/50 text-zinc-600'
                  )}
                >
                  {selectedSignal ? `${selectedSignal.side} ${activeExchange.name}` : 'Select Signal'}
                </button>
                <button
                  type="button"
                  onClick={deployToAllVenues}
                  disabled={!canDeploy}
                  className={cx(
                    'w-full rounded-xl border py-3 text-[10px] font-black uppercase tracking-[0.18em] transition-colors',
                    canDeploy
                      ? 'border-white/15 bg-white/[0.035] text-zinc-300 hover:bg-white/[0.06]'
                      : 'cursor-not-allowed border-white/5 bg-transparent text-zinc-700'
                  )}
                >
                  Fan Out All Venues
                </button>
              </div>
            </div>
          </Panel>
        </div>

      </main>
    </AppShell>
  );
}
