'use client';

import React, { useEffect, useState } from 'react';
import { AppShell, Icon, Panel, cx, fmt, pct, safeFixed } from '../components/mostarUi';

type PaperOrder = {
  order_id: string;
  asset: string;
  side: string;
  entry: number | null;
  exit_price: number | null;
  outcome: string;
  r_multiple: number | null;
  status: string;
  regime_version: string;
  confidence_gate_eligible: boolean;
  reconstructed: boolean;
  research_only: boolean;
  fill_time: string | null;
  resolved_at: string | null;
  created_at: string;
};

type GateData = {
  signal_count: number;
  wins: number;
  losses: number;
  expired: number;
  win_rate: number;
  profit_factor: number;
  gate_status: string;
};

function outcomeTone(outcome: string) {
  if (outcome === 'WIN') return 'mostar-text-live';
  if (outcome === 'LOSS') return 'mostar-text-danger';
  if (outcome === 'OPEN') return 'mostar-text-gold';
  return 'mostar-text-muted';
}

function sideTone(side: string) {
  return side === 'LONG' ? 'mostar-text-live' : 'mostar-text-danger';
}

export default function LivePage() {
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [gate, setGate] = useState<GateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ts, setTs] = useState('');

  async function load() {
    try {
      const [ordersRes, gateRes] = await Promise.all([
        fetch('/api/python/paper-orders?limit=50').then(r => r.ok ? r.json() : null),
        fetch('/api/python/confidence-gate', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
      ]);
      if (ordersRes) setOrders(Array.isArray(ordersRes.orders) ? ordersRes.orders : []);
      if (gateRes && gateRes.data_source !== 'error') setGate(gateRes);
      setTs(new Date().toLocaleTimeString());
    } catch {
      // swallow
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, []);

  const pf = gate?.profit_factor ?? 0;
  const pfTone = pf >= 1.3 ? 'mostar-text-live' : pf >= 0.8 ? 'mostar-text-gold' : 'mostar-text-danger';

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mostar-pill mostar-pill-blue inline-flex px-3 py-1 text-[10px] mb-2">Paper Execution Feed</div>
          <h1 className="mostar-text-white text-2xl font-black tracking-tight">Execution Ledger</h1>
          <p className="mostar-text-muted text-xs mt-1">Paper orders · Resolved WIN / LOSS / EXPIRED · Last updated {ts || '—'}</p>
        </div>
        <span className={cx('mostar-pill px-3 py-1 text-[10px]', pf >= 1.0 ? 'mostar-status-live' : 'mostar-status-danger')}>
          PF {safeFixed(pf, 3)}
        </span>
      </div>

      {gate && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {[
            { label: 'Resolved', value: fmt(gate.signal_count), icon: 'activity' as const },
            { label: 'Wins', value: fmt(gate.wins), icon: 'check' as const, tone: 'mostar-text-live' },
            { label: 'Losses', value: fmt(gate.losses), icon: 'x' as const, tone: 'mostar-text-danger' },
            { label: 'Expired', value: fmt(gate.expired), icon: 'clock' as const },
            { label: 'Win Rate', value: pct(gate.win_rate), icon: 'gauge' as const, tone: gate.win_rate >= 40 ? 'mostar-text-live' : 'mostar-text-gold' },
            { label: 'Profit Factor', value: safeFixed(pf, 3), icon: 'crown' as const, tone: pfTone },
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

      <Panel title="Paper Executions" subtitle="Gate-eligible orders only — newest first" icon="scroll">
        {loading ? (
          <div className="mostar-text-muted text-xs py-8 text-center">Loading paper executions…</div>
        ) : orders.length === 0 ? (
          <div className="mostar-text-muted text-xs py-8 text-center">
            No paper orders yet — gate count is honest at 0/200
          </div>
        ) : (
          <div className="mostar-table-shell overflow-x-auto rounded-2xl">
            <table className="w-full text-xs">
              <thead className="mostar-table-head">
                <tr>
                  {['Asset', 'Side', 'Status', 'Outcome', 'Entry', 'Exit', 'R', 'Regime', 'Flags', 'Time'].map(h => (
                    <th key={h} className="mostar-text-muted px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.18em] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.order_id} className="mostar-table-row border-t border-white/5">
                    <td className="mostar-text-white px-3 py-2 font-mono font-bold whitespace-nowrap">{o.asset}</td>
                    <td className={cx('px-3 py-2 font-black text-[11px]', sideTone(o.side))}>{o.side}</td>
                    <td className="mostar-text-muted px-3 py-2 text-[10px]">{o.status}</td>
                    <td className={cx('px-3 py-2 font-black text-[11px]', outcomeTone(o.outcome))}>{o.outcome}</td>
                    <td className="mostar-text-white px-3 py-2 font-mono">{o.entry != null ? safeFixed(o.entry, 4) : '—'}</td>
                    <td className="mostar-text-muted px-3 py-2 font-mono">{o.exit_price != null ? safeFixed(o.exit_price, 4) : '—'}</td>
                    <td className={cx('px-3 py-2 font-mono', o.r_multiple != null ? (o.r_multiple > 0 ? 'mostar-text-live' : 'mostar-text-danger') : 'mostar-text-muted')}>
                      {o.r_multiple != null ? `${o.r_multiple > 0 ? '+' : ''}${safeFixed(o.r_multiple, 2)}R` : '—'}
                    </td>
                    <td className="mostar-text-muted px-3 py-2 text-[10px]">{o.regime_version}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        {o.reconstructed && (
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide bg-yellow-500/20 text-yellow-400">reconstructed</span>
                        )}
                        {!o.confidence_gate_eligible && (
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide bg-zinc-700/50 text-zinc-500">excluded</span>
                        )}
                        {o.research_only && (
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide bg-blue-500/20 text-blue-400">research</span>
                        )}
                      </div>
                    </td>
                    <td className="mostar-text-muted px-3 py-2 text-[10px] whitespace-nowrap">
                      {o.resolved_at
                        ? new Date(o.resolved_at).toLocaleString()
                        : new Date(o.created_at).toLocaleString()}
                    </td>
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
