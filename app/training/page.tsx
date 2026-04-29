'use client';

import React, { useEffect, useState } from 'react';

type Stats = {
  total_signals: number;
  wins: number;
  losses: number;
  win_rate: number;
  profit_factor: number;
};

type GateStat = {
  rejection_gate: string;
  killed_count: number;
  kill_pct: number;
};

type FamilyStat = {
  family: string;
  total: number;
  killed: number;
  passed: number;
};

type RegimeStat = {
  regime: string;
  total: number;
  killed: number;
  kill_rate_pct: number;
};

type PairStat = {
  pair: string;
  total_seen: number;
  killed: number;
};

type TrainingSummary = {
  total_7d: number;
  passed_7d: number;
  killed_7d: number;
  kill_rate_pct: number;
};

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

export default function TrainingEngine() {
  const [stats, setStats] = useState<Stats>({
    total_signals: 0,
    wins: 0,
    losses: 0,
    win_rate: 0,
    profit_factor: 0,
  });
  const [statusText, setStatusText] = useState('loading');
  const [training, setTraining] = useState<TrainingData>(EMPTY_TRAINING);
  const [trainingError, setTrainingError] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, statusRes, trainingRes] = await Promise.all([
          fetch('/api/python/stats', { cache: 'no-store' }),
          fetch('/api/python/status', { cache: 'no-store' }),
          fetch('/api/python/training', { cache: 'no-store' }),
        ]);

        if (statsRes.ok) {
          const payload = await statsRes.json();
          setStats({
            total_signals: Number(payload.total_signals || 0),
            wins: Number(payload.wins || 0),
            losses: Number(payload.losses || 0),
            win_rate: Number(payload.win_rate || 0),
            profit_factor: Number(payload.profit_factor || 0),
          });
        }

        if (statusRes.ok) {
          const status = await statusRes.json();
          setStatusText(String(status.scanner_state || 'unknown'));
        }

        if (trainingRes.ok) {
          const t = await trainingRes.json();
          if (t.data_source === 'error') {
            setTrainingError(true);
          } else {
            setTraining({
              summary: t.summary ?? null,
              gate_stats: Array.isArray(t.gate_stats) ? t.gate_stats : [],
              family_breakdown: Array.isArray(t.family_breakdown) ? t.family_breakdown : [],
              regime_breakdown: Array.isArray(t.regime_breakdown) ? t.regime_breakdown : [],
              top_rejected_pairs: Array.isArray(t.top_rejected_pairs) ? t.top_rejected_pairs : [],
            });
            setTrainingError(false);
          }
        } else {
          setTrainingError(true);
        }
      } catch {
        setStatusText('degraded');
        setTrainingError(true);
      }
    };

    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, []);

  const killRateColor = (pct: number) => {
    if (pct >= 90) return 'text-red-400';
    if (pct >= 70) return 'text-orange-400';
    return 'text-yellow-400';
  };

  return (
    <div className="flex-1 p-6 flex flex-col gap-6">
      <header className="mb-2 pb-4 border-b border-[#222]">
        <h1 className="text-3xl font-black tracking-tighter uppercase mb-4">Training Console</h1>
        <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Read-only observer analytics · no synthetic training simulation</div>
      </header>

      {/* Performance Summary */}
      <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 -mb-2">Performance Summary · paper signal outcomes</div>
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-4 bg-[#111] p-6 rounded border border-[#222]">
          <h2 className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-6">Runtime</h2>
          <div className="space-y-4">
            <div className="flex justify-between"><span className="text-gray-400">Scanner</span><span className="font-black uppercase">{statusText}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Total Signals</span><span className="font-black">{stats.total_signals}</span></div>
          </div>
        </section>

        <section className="lg:col-span-8 bg-[#111] p-6 rounded border border-[#222]">
          <h2 className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-6">Observer-Derived Quality Metrics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><div className="text-gray-500 text-[10px] uppercase">Wins</div><div className="text-3xl font-black text-green-400">{stats.wins}</div></div>
            <div><div className="text-gray-500 text-[10px] uppercase">Losses</div><div className="text-3xl font-black text-red-400">{stats.losses}</div></div>
            <div><div className="text-gray-500 text-[10px] uppercase">Win Rate</div><div className="text-3xl font-black">{stats.win_rate.toFixed(2)}%</div></div>
            <div><div className="text-gray-500 text-[10px] uppercase">Profit Factor</div><div className="text-3xl font-black text-cyan-400">{stats.profit_factor.toFixed(2)}</div></div>
          </div>
        </section>
      </main>

      {/* Training Telemetry */}
      <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 -mb-2">Training Telemetry · scanner gate rejection history · read-only · does not affect execution</div>

      {trainingError ? (
        <div className="bg-[#111] p-6 rounded border border-[#333] text-gray-500 text-sm">
          Training telemetry unavailable — Python API unreachable or returning error.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Summary bar */}
          {training.summary && (
            <section className="lg:col-span-12 bg-[#111] p-6 rounded border border-[#222]">
              <h2 className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-4">7-Day Candidate Flow</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-gray-500 text-[10px] uppercase">Total Candidates</div>
                  <div className="text-3xl font-black">{Number(training.summary.total_7d).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-[10px] uppercase">Passed Gates</div>
                  <div className="text-3xl font-black text-green-400">{Number(training.summary.passed_7d).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-[10px] uppercase">Killed by Gates</div>
                  <div className="text-3xl font-black text-red-400">{Number(training.summary.killed_7d).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-[10px] uppercase">Kill Rate</div>
                  <div className={`text-3xl font-black ${killRateColor(Number(training.summary.kill_rate_pct))}`}>
                    {Number(training.summary.kill_rate_pct).toFixed(1)}%
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Gate kill breakdown */}
          <section className="lg:col-span-5 bg-[#111] p-6 rounded border border-[#222]">
            <h2 className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-4">Gate Kill Breakdown</h2>
            {training.gate_stats.length === 0 ? (
              <div className="text-gray-600 text-sm">No data</div>
            ) : (
              <div className="space-y-2">
                {training.gate_stats.map((g) => (
                  <div key={g.rejection_gate} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-gray-300 truncate">{g.rejection_gate}</div>
                      <div className="h-1 mt-1 bg-[#222] rounded">
                        <div
                          className="h-1 rounded bg-red-500"
                          style={{ width: `${Math.min(Number(g.kill_pct), 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-red-400">{Number(g.kill_pct).toFixed(1)}%</div>
                      <div className="text-[10px] text-gray-600">{Number(g.killed_count).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Regime distribution */}
          <section className="lg:col-span-4 bg-[#111] p-6 rounded border border-[#222]">
            <h2 className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-4">Regime Distribution</h2>
            {training.regime_breakdown.length === 0 ? (
              <div className="text-gray-600 text-sm">No data</div>
            ) : (
              <div className="space-y-3">
                {training.regime_breakdown.map((r) => (
                  <div key={r.regime} className="flex justify-between items-center">
                    <span className="text-xs uppercase font-bold text-gray-400">{r.regime}</span>
                    <div className="text-right">
                      <span className={`text-xs font-black ${killRateColor(Number(r.kill_rate_pct))}`}>
                        {Number(r.kill_rate_pct).toFixed(0)}% killed
                      </span>
                      <span className="text-[10px] text-gray-600 ml-2">({Number(r.total).toLocaleString()})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Family breakdown */}
          <section className="lg:col-span-3 bg-[#111] p-6 rounded border border-[#222]">
            <h2 className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-4">Signal Family</h2>
            {training.family_breakdown.length === 0 ? (
              <div className="text-gray-600 text-sm">No data</div>
            ) : (
              <div className="space-y-3">
                {training.family_breakdown.map((f) => (
                  <div key={f.family}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-bold text-gray-300 uppercase">{f.family}</span>
                      <span className="text-gray-500">{Number(f.passed).toLocaleString()} pass</span>
                    </div>
                    <div className="h-1 bg-[#222] rounded">
                      <div
                        className="h-1 rounded bg-orange-500"
                        style={{ width: `${Math.min((Number(f.killed) / Math.max(Number(f.total), 1)) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Top rejected pairs */}
          <section className="lg:col-span-12 bg-[#111] p-6 rounded border border-[#222]">
            <h2 className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-4">Top Rejected Pairs · 7d</h2>
            {training.top_rejected_pairs.length === 0 ? (
              <div className="text-gray-600 text-sm">No data</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {training.top_rejected_pairs.map((p) => {
                  const killPct = (Number(p.killed) / Math.max(Number(p.total_seen), 1)) * 100;
                  return (
                    <div key={p.pair} className="bg-[#0d0d0d] p-3 rounded border border-[#1a1a1a]">
                      <div className="font-black text-sm">{p.pair}</div>
                      <div className={`text-lg font-black ${killRateColor(killPct)}`}>{killPct.toFixed(0)}%</div>
                      <div className="text-[10px] text-gray-600">{Number(p.killed).toLocaleString()} killed / {Number(p.total_seen).toLocaleString()} seen</div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      )}
    </div>
  );
}
