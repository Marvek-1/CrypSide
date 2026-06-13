'use client';

import React, { useEffect, useState } from 'react';
import { AppShell, Icon, Panel, cx, fmt, safeFixed, pct } from '../components/mostarUi';

type Signal = {
  signal_id: string;
  pair: string;
  side: string;
  score: number;
  entry: number;
  stop_loss: number;
  take_profit: number;
  regime: string;
  btc_regime?: string;
  signal_family?: string;
  outcome?: string;
  r_multiple?: number;
  ts: string;
};

type Stats = {
  total_signals: number;
  wins: number;
  losses: number;
  win_rate: number;
  profit_factor: number;
  signals_per_day: number;
  avg_score?: number;
};

function outcomeTone(outcome?: string) {
  if (!outcome) return 'mostar-text-muted';
  if (outcome === 'WIN') return 'mostar-text-live';
  if (outcome === 'LOSS') return 'mostar-text-danger';
  return 'mostar-text-muted';
}

function sideTone(side: string) {
  return side === 'LONG' ? 'mostar-text-live' : 'mostar-text-danger';
}

export default function LivePage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState('');

  async function load() {
    try {
      const [sigRes, statRes] = await Promise.all([
        fetch('/api/python/signals').then(r => r.ok ? r.json() : null),
        fetch('/api/python/stats').then(r => r.ok ? r.json() : null),
      ]);
      if (sigRes) setSignals(Array.isArray(sigRes) ? sigRes : (sigRes.signals ?? []));
      if (statRes) setStats(statRes);
      setTs(new Date().toLocaleTimeString());
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, []);

  const pf = stats ? (stats.profit_factor ?? 0) : 0;
  const pfTone = pf >= 1.3 ? 'mostar-text-live' : pf >= 0.8 ? 'mostar-text-gold' : 'mostar-text-danger';

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mostar-pill mostar-pill-blue inline-flex px-3 py-1 text-[10px] mb-2">Live Signal Stream</div>
          <h1 className="mostar-text-white text-2xl font-black tracking-tight">Execution Ledger</h1>
          <p className="mostar-text-muted text-xs mt-1">Paper mode · Real-time signal history · Last updated {ts || '—'}</p>
        </div>
        <span className={cx('mostar-pill px-3 py-1 text-[10px]', pf >= 1.0 ? 'mostar-status-live' : 'mostar-status-danger')}>
          PF {safeFixed(pf, 3)}
        </span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { label: 'Total Signals', value: fmt(stats.total_signals), icon: 'activity' as const },
            { label: 'Wins', value: fmt(stats.wins), icon: 'check' as const, tone: 'mostar-text-live' },
            { label: 'Losses', value: fmt(stats.losses), icon: 'x' as const, tone: 'mostar-text-danger' },
            { label: 'Win Rate', value: pct(stats.win_rate), icon: 'gauge' as const, tone: stats.win_rate >= 40 ? 'mostar-text-live' : 'mostar-text-gold' },
            { label: 'Profit Factor', value: safeFixed(pf, 3), icon: 'crown' as const, tone: pfTone },
            { label: 'Signals / Day', value: safeFixed(stats.signals_per_day, 1), icon: 'signal' as const },
          ].map((m) => (
            <div key={m.label} className="mostar-card rounded-3xl p-4">
              <div className="mostar-text-muted mb-2 flex items-center justify-between gap-2">
                <div className="text-[10px] font-black uppercase tracking-[0.18em]">{m.label}</div>
                <Icon name={m.icon} size={14} />
              </div>
              <div className={cx('text-xl font-black tracking-tight', m.tone ?? 'mostar-text-white')}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      <Panel title="Recent Signals" subtitle="Latest paper trades — newest first" icon="scroll">
        {loading ? (
          <div className="mostar-text-muted text-xs py-8 text-center">Loading signal stream…</div>
        ) : signals.length === 0 ? (
          <div className="mostar-text-muted text-xs py-8 text-center">No signals yet</div>
        ) : (
          <div className="mostar-table-shell overflow-x-auto rounded-2xl">
            <table className="w-full text-xs">
              <thead className="mostar-table-head">
                <tr>
                  {['Pair', 'Side', 'Family', 'Score', 'Entry', 'SL', 'TP', 'Regime', 'Outcome', 'R', 'Time'].map(h => (
                    <th key={h} className="mostar-text-muted px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.18em] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {signals.slice(0, 50).map((s) => (
                  <tr key={s.signal_id} className="mostar-table-row border-t border-white/5">
                    <td className="mostar-text-white px-3 py-2 font-mono font-bold whitespace-nowrap">{s.pair}</td>
                    <td className={cx('px-3 py-2 font-black text-[11px]', sideTone(s.side))}>{s.side}</td>
                    <td className="mostar-text-muted px-3 py-2 capitalize">{s.signal_family || 'none'}</td>
                    <td className="mostar-text-gold px-3 py-2 font-mono font-bold">{safeFixed(s.score, 1)}</td>
                    <td className="mostar-text-white px-3 py-2 font-mono">{safeFixed(s.entry, 4)}</td>
                    <td className="mostar-text-danger px-3 py-2 font-mono">{safeFixed(s.stop_loss, 4)}</td>
                    <td className="mostar-text-live px-3 py-2 font-mono">{safeFixed(s.take_profit, 4)}</td>
                    <td className="mostar-text-muted px-3 py-2 text-[10px]">{s.regime}</td>
                    <td className={cx('px-3 py-2 font-black text-[11px]', outcomeTone(s.outcome))}>{s.outcome ?? '—'}</td>
                    <td className={cx('px-3 py-2 font-mono', s.r_multiple != null ? (s.r_multiple > 0 ? 'mostar-text-live' : 'mostar-text-danger') : 'mostar-text-muted')}>
                      {s.r_multiple != null ? `${s.r_multiple > 0 ? '+' : ''}${safeFixed(s.r_multiple, 2)}R` : '—'}
                    </td>
                    <td className="mostar-text-muted px-3 py-2 text-[10px] whitespace-nowrap">{new Date(s.ts).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
