// app/training/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AppShell, Icon, IconName, Metric, Panel, cx, fmt, pct } from '../components/mostarUi';

type Stats = { total_signals: number; wins: number; losses: number; win_rate: number; profit_factor: number };
type GateStat = { rejection_gate: string; killed_count: number; kill_pct: number };
type FamilyStat = { family: string; total: number; killed: number; passed: number };
type RegimeStat = { regime: string; total: number; killed: number; kill_rate_pct: number };
type PairStat = { pair: string; total_seen: number; killed: number };
type TrainingSummary = { total_7d: number; passed_7d: number; killed_7d: number; kill_rate_pct: number };
type TrainingData = {
  summary: TrainingSummary | null;
  gate_stats: GateStat[];
  family_breakdown: FamilyStat[];
  regime_breakdown: RegimeStat[];
  top_rejected_pairs: PairStat[];
};

const EMPTY_TRAINING: TrainingData = {
  summary: null,
  gate_stats: [],
  family_breakdown: [],
  regime_breakdown: [],
  top_rejected_pairs: [],
};

function killTone(rate: number) {
  if (rate >= 90) return 'mostar-status-danger';
  if (rate >= 70) return 'mostar-status-warning';
  return 'mostar-status-warning';
}

function statusTone(status: string) {
  const s = status.toLowerCase();
  if (s.includes('run') || s.includes('online') || s.includes('active')) return 'mostar-status-live';
  if (s.includes('degraded') || s.includes('unknown') || s.includes('loading')) return 'mostar-status-warning';
  return 'mostar-status-danger';
}

function TrainingCore({ state, killRate }: { state: string; killRate: number }) {
  const critical = killRate >= 90 || state.toLowerCase().includes('stop') || state.toLowerCase().includes('down');
  const warning = !critical && (killRate >= 70 || state.toLowerCase().includes('degraded') || state.toLowerCase().includes('unknown'));
  const glow = critical ? 'from-[var(--mostar-danger)] via-[var(--mostar-gold)] to-[var(--mostar-danger)]' : warning ? 'from-[var(--mostar-gold)] via-[var(--mostar-royal-blue)] to-[var(--mostar-yellow)]' : 'from-[var(--mostar-royal-blue)] via-[var(--mostar-white)] to-[var(--mostar-gold)]';
  const ring = critical ? 'border-[var(--mostar-danger)]/45' : warning ? 'border-[var(--mostar-gold)]/45' : 'border-[var(--mostar-royal-blue)]/50';
  const label = critical ? 'HIGH REJECTION PRESSURE' : warning ? 'GATE WATCH STATE' : 'TRAINING TELEMETRY STABLE';

  return (
    <div className="relative flex min-h-[320px] items-center justify-center">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(248,251,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(248,251,255,0.045)_1px,transparent_1px)] bg-[size:36px_36px] opacity-50" />
      <motion.div animate={{ rotate: 360 }} transition={{ duration: critical ? 8 : 24, repeat: Infinity, ease: 'linear' }} className={cx('absolute h-72 w-72 rounded-full border border-dashed', ring)} />
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 35, repeat: Infinity, ease: 'linear' }} className="absolute h-56 w-56 rounded-full border border-[var(--mostar-white)]/10" />
      <motion.div animate={{ scale: critical ? [1, 1.07, 0.98, 1] : [1, 1.025, 1] }} transition={{ duration: critical ? 1.3 : 3.6, repeat: Infinity, ease: 'easeInOut' }} className={cx('relative h-48 w-48 rounded-full bg-gradient-to-br p-[1px] shadow-2xl', glow)}>
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[var(--mostar-night-blue)] text-center">
          <Icon name="brain" className="mb-3 text-[var(--mostar-gold)]" size={32} />
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--mostar-muted)]">Training Core</div>
          <div className="mt-1 max-w-[150px] text-sm font-black uppercase leading-tight text-[var(--mostar-white)]">{label}</div>
        </div>
      </motion.div>
      <div className="absolute bottom-0 flex flex-wrap justify-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]">
        <span className="mostar-pill-gold rounded-full px-3 py-1">Read Only</span>
        <span className="mostar-pill-blue rounded-full px-3 py-1">No Simulation</span>
        <span className="mostar-pill-white rounded-full px-3 py-1">Truth Visible</span>
      </div>
    </div>
  );
}

export default function TrainingEngine() {
  const [stats, setStats] = useState<Stats>({ total_signals: 0, wins: 0, losses: 0, win_rate: 0, profit_factor: 0 });
  const [statusText, setStatusText] = useState('loading');
  const [training, setTraining] = useState<TrainingData>(EMPTY_TRAINING);
  const [trainingError, setTrainingError] = useState(false);
  const [lastRefresh, setLastRefresh] = useState('—');

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, statusRes, trainingRes] = await Promise.all([
          fetch('/api/python/stats', { cache: 'no-store' }),
          fetch('/api/python/status', { cache: 'no-store' }),
          fetch('/api/python/training', { cache: 'no-store' }),
        ]);
        if (statsRes.ok) {
          const p = await statsRes.json();
          setStats({ total_signals: Number(p.total_signals || 0), wins: Number(p.wins || 0), losses: Number(p.losses || 0), win_rate: Number(p.win_rate || 0), profit_factor: Number(p.profit_factor || 0) });
        }
        if (statusRes.ok) {
          const s = await statusRes.json();
          setStatusText(String(s.scanner_state || 'unknown'));
        }
        if (trainingRes.ok) {
          const t = await trainingRes.json();
          if (t.data_source === 'error') setTrainingError(true);
          else {
            setTraining({
              summary: t.summary ?? null,
              gate_stats: Array.isArray(t.gate_stats) ? t.gate_stats : [],
              family_breakdown: Array.isArray(t.family_breakdown) ? t.family_breakdown : [],
              regime_breakdown: Array.isArray(t.regime_breakdown) ? t.regime_breakdown : [],
              top_rejected_pairs: Array.isArray(t.top_rejected_pairs) ? t.top_rejected_pairs : [],
            });
            setTrainingError(false);
          }
        } else setTrainingError(true);
        setLastRefresh(new Date().toLocaleTimeString());
      } catch {
        setStatusText('degraded');
        setTrainingError(true);
        setLastRefresh(new Date().toLocaleTimeString());
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, []);

  const killRate = Number(training.summary?.kill_rate_pct || 0);
  const passedPct = training.summary ? (Number(training.summary.passed_7d) / Math.max(Number(training.summary.total_7d), 1)) * 100 : 0;
  const killedPct = training.summary ? (Number(training.summary.killed_7d) / Math.max(Number(training.summary.total_7d), 1)) * 100 : 0;

  const verdict = useMemo(() => {
    if (trainingError) return { label: 'Telemetry unavailable', tone: 'text-[#FF8585]', icon: 'x' as IconName };
    if (killRate >= 90) return { label: 'High rejection pressure', tone: 'text-[#FF8585]', icon: 'alert' as IconName };
    if (killRate >= 70) return { label: 'Gate pressure elevated', tone: 'text-[var(--mostar-gold)]', icon: 'gauge' as IconName };
    return { label: 'Training telemetry stable', tone: 'text-[var(--mostar-success)]', icon: 'shield' as IconName };
  }, [killRate, trainingError]);

  return (
    <AppShell max="max-w-7xl">
      <motion.header initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mostar-panel rounded-[2rem] p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em]">
              <span className="mostar-pill-blue rounded-full px-3 py-1">MoStar Industries</span>
              <span className="mostar-pill-gold rounded-full px-3 py-1">Training Console</span>
              <span className={cx('rounded-full px-3 py-1', statusTone(statusText))}>Scanner: {statusText}</span>
            </div>
            <h1 className="text-3xl font-black uppercase tracking-[-0.045em] md:text-5xl">Training Console</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--mostar-muted)]">Read-only scanner analytics. No synthetic training simulation. Every rejection is evidence.</p>
          </div>
          <div className="mostar-pill-white rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em]">Refresh: {lastRefresh}</div>
        </div>
      </motion.header>

      <main className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel className="xl:col-span-5" title="Sovereign Training Core" subtitle="Motion explains state. Beauty reveals truth." icon="brain">
          <TrainingCore state={statusText} killRate={killRate} />
        </Panel>

        <Panel className="xl:col-span-7" title="Observer-Derived Quality Metrics" subtitle="Paper signal outcomes from scanner memory." icon="activity">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Wins" value={fmt(stats.wins)} tone="text-[var(--mostar-success)]" icon="check" />
            <Metric label="Losses" value={fmt(stats.losses)} tone="text-[#FF8585]" icon="x" />
            <Metric label="Win Rate" value={`${stats.win_rate.toFixed(2)}%`} tone="text-[var(--mostar-gold)]" icon="gauge" />
            <Metric label="Profit Factor" value={stats.profit_factor.toFixed(2)} tone="text-[#9DB2FF]" icon="radar" />
          </div>
        </Panel>

        <Panel className="xl:col-span-12" title="Covenant Telemetry" subtitle="Scanner gate rejection history · read-only · does not affect execution." icon="shield">
          {trainingError ? (
            <div className="mostar-status-danger rounded-2xl p-5 text-sm">Training telemetry unavailable — Python API unreachable or returning error.</div>
          ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <Metric label="Total Candidates" value={fmt(training.summary?.total_7d || 0)} icon="terminal" />
                <Metric label="Passed Gates" value={fmt(training.summary?.passed_7d || 0)} tone="text-[var(--mostar-success)]" sub={`${pct(passedPct)} of flow`} icon="check" />
                <Metric label="Killed by Gates" value={fmt(training.summary?.killed_7d || 0)} tone="text-[#FF8585]" sub={`${pct(killedPct)} of flow`} icon="skull" />
                <div className={cx('rounded-3xl border p-4', killTone(killRate))}>
                  <div className="mb-3 flex items-center justify-between text-current/70"><div className="text-[10px] font-black uppercase tracking-[0.22em]">Kill Rate</div><Icon name={verdict.icon} size={16} /></div>
                  <div className="text-3xl font-black tracking-tight">{pct(killRate)}</div>
                  <div className={cx('mt-1 text-[11px]', verdict.tone)}>{verdict.label}</div>
                </div>
              </div>
          )}
        </Panel>

        {!trainingError && (
          <>
            <Panel className="xl:col-span-5" title="Gate Kill Breakdown" subtitle="Which gate is rejecting candidates." icon="lock">
              <div className="space-y-3">
                {training.gate_stats.length === 0 && <div className="text-sm text-[var(--mostar-muted)]">No data</div>}
                {training.gate_stats.map((g) => (
                  <div key={g.rejection_gate} className="mostar-card rounded-2xl p-3">
                    <div className="mb-2 flex items-center justify-between gap-3"><div className="truncate font-mono text-xs">{g.rejection_gate}</div><div className="text-xs font-black text-[#FF8585]">{pct(g.kill_pct)}</div></div>
                    <div className="h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-[var(--mostar-danger)] to-[var(--mostar-gold)]" style={{ width: `${Math.min(Number(g.kill_pct), 100)}%` }} /></div>
                    <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-[var(--mostar-muted)]">{fmt(g.killed_count)} killed</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="xl:col-span-4" title="Regime Distribution" subtitle="Market regimes under gate pressure." icon="radar">
              <div className="space-y-3">
                {training.regime_breakdown.length === 0 && <div className="text-sm text-[var(--mostar-muted)]">No data</div>}
                {training.regime_breakdown.map((r) => (
                  <div key={r.regime} className="mostar-card rounded-2xl p-3">
                    <div className="flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-[0.14em]">{r.regime}</span><span className="mostar-status-warning rounded-full px-2 py-1 text-[10px] font-black">{pct(r.kill_rate_pct, 0)} killed</span></div>
                    <div className="mt-2 text-[10px] text-[var(--mostar-muted)]">{fmt(r.total)} candidates · {fmt(r.killed)} killed</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="xl:col-span-3" title="Signal Family" subtitle="Family pass/killed balance." icon="flame">
              <div className="space-y-3">
                {training.family_breakdown.length === 0 && <div className="text-sm text-[var(--mostar-muted)]">No data</div>}
                {training.family_breakdown.map((f) => {
                  const familyKillPct = (Number(f.killed) / Math.max(Number(f.total), 1)) * 100;
                  return (
                    <div key={f.family}>
                      <div className="mb-1 flex justify-between gap-3 text-xs"><span className="font-black uppercase">{f.family}</span><span className="text-[var(--mostar-muted)]">{fmt(f.passed)} pass</span></div>
                      <div className="h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-[var(--mostar-gold)] to-[var(--mostar-danger)]" style={{ width: `${Math.min(familyKillPct, 100)}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel className="xl:col-span-12" title="Top Rejected Pairs · 7D" subtitle="The machine names what it rejects." icon="scroll">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {training.top_rejected_pairs.length === 0 && <div className="text-sm text-[var(--mostar-muted)]">No data</div>}
                {training.top_rejected_pairs.map((p) => {
                  const rate = (Number(p.killed) / Math.max(Number(p.total_seen), 1)) * 100;
                  return (
                    <div key={p.pair} className="mostar-card rounded-2xl p-4">
                      <div className="mb-2 flex items-center justify-between"><div className="font-black">{p.pair}</div><Icon name="skull" className="text-[#FF8585]" size={15} /></div>
                      <div className="text-2xl font-black text-[var(--mostar-gold)]">{pct(rate, 0)}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--mostar-muted)]">{fmt(p.killed)} killed / {fmt(p.total_seen)} seen</div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </>
        )}
      </main>
    </AppShell>
  );
}
