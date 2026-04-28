'use client';

import React, { useEffect, useState } from 'react';

type Signal = {
  signal_id?: string;
  id?: string;
  pair: string;
  ts?: string;
  timestamp?: string;
  side: string;
  score: number;
};

type Stats = {
  total_signals: number;
  wins: number;
  losses: number;
  win_rate: number;
  profit_factor: number;
  signals_per_day: number;
};

type MoEdgeSentinel = {
  status: string;
  meaning: string;
  threshold_check: {
    '00_15_ev': number;
    '15_30_ev': number;
    '30_45_ev': number;
    '45_plus_ev': number;
  };
  last_checked: number;
};

type KillAnalytics = {
  gate_stats: Array<{
    rejection_gate: string;
    killed_count: number;
    kill_percentage: number;
  }>;
  overall: {
    total_candidates: number;
    passed_gates: number;
    killed_by_gates: number;
    overall_kill_rate: number;
  };
  top_killer_24h: {
    rejection_gate: string;
    kill_count_24h: number;
  } | null;
  last_checked: number;
};

export default function SovereignIngestionNode() {
  const [statusText, setStatusText] = useState('loading');
  const [stats, setStats] = useState<Stats>({
    total_signals: 0,
    wins: 0,
    losses: 0,
    win_rate: 0,
    profit_factor: 0,
    signals_per_day: 0,
  });
  const [signals, setSignals] = useState<Signal[]>([]);
  const [moedgeSentinel, setMoedgeSentinel] = useState<MoEdgeSentinel | null>(null);
  const [killAnalytics, setKillAnalytics] = useState<KillAnalytics | null>(null);

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

        if (statusRes.ok) {
          const status = await statusRes.json();
          setStatusText(String(status.scanner_state || 'unknown'));
        } else {
          setStatusText('degraded');
        }

        if (statsRes.ok) {
          const payload = await statsRes.json();
          setStats({
            total_signals: Number(payload.total_signals || 0),
            wins: Number(payload.wins || 0),
            losses: Number(payload.losses || 0),
            win_rate: Number(payload.win_rate || 0),
            profit_factor: Number(payload.profit_factor || 0),
            signals_per_day: Number(payload.signals_per_day || 0),
          });
        }

        if (signalsRes.ok) {
          const payload = await signalsRes.json();
          setSignals(Array.isArray(payload.signals) ? payload.signals : []);
        }

        if (moedgeRes.ok) {
          const payload = await moedgeRes.json();
          setMoedgeSentinel(payload);
        }

        if (killRes.ok) {
          const payload = await killRes.json();
          setKillAnalytics(payload);
        }
      } catch {
        setStatusText('degraded');
      }
    };

    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex-1 p-6 flex flex-col gap-6">
      <header className="mb-2 pb-4 border-b border-[#222]">
        <h1 className="text-3xl font-black tracking-tighter mb-4 uppercase">MoStar Sovereign Data Conduit</h1>
        <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Data source: LIVE BACKEND ONLY</div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        <section className="lg:col-span-4 bg-[#111] p-6 rounded border border-[#222]">
          <h2 className="text-[10px] uppercase tracking-widest text-gray-500 mb-6 font-bold">System Status</h2>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-400">Scanner State</span>
              <span className="font-black uppercase">{statusText}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total Signals</span>
              <span className="font-black">{stats.total_signals}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Win / Loss</span>
              <span className="font-black">{stats.wins} / {stats.losses}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Win Rate</span>
              <span className="font-black">{stats.win_rate.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Profit Factor</span>
              <span className="font-black">{stats.profit_factor.toFixed(2)}</span>
            </div>
          </div>
        </section>

        <section className="lg:col-span-4 bg-[#111] p-6 rounded border border-[#222]">
          <h2 className="text-[10px] uppercase tracking-widest text-gray-500 mb-6 font-bold">MoEdge Sentinel</h2>
          {moedgeSentinel ? (
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <span className={`font-black uppercase ${
                  moedgeSentinel.status === 'MOEDGE_PREDICTIVE' ? 'text-green-500' :
                  moedgeSentinel.status === 'MOEDGE_MISWEIGHTED' ? 'text-red-500' :
                  moedgeSentinel.status === 'SYSTEM_EDGE_NEGATIVE' ? 'text-orange-500' :
                  'text-gray-400'
                }`}>{moedgeSentinel.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">15-30 EV</span>
                <span className="font-black">{moedgeSentinel.threshold_check['15_30_ev'].toFixed(3)}R</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">30-45 EV</span>
                <span className="font-black">{moedgeSentinel.threshold_check['30_45_ev'].toFixed(3)}R</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">45+ EV</span>
                <span className="font-black">{moedgeSentinel.threshold_check['45_plus_ev'].toFixed(3)}R</span>
              </div>
              <div className="text-[9px] text-gray-500 mt-4 leading-tight">
                {moedgeSentinel.meaning}
              </div>
            </div>
          ) : (
            <div className="text-gray-500">Loading...</div>
          )}
        </section>

        <section className="lg:col-span-4 bg-[#111] p-6 rounded border border-[#222]">
          <h2 className="text-[10px] uppercase tracking-widest text-gray-500 mb-6 font-bold">CrypSide Kill Analytics</h2>
          {killAnalytics ? (
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-400">Top Killer (24h)</span>
                <span className="font-black uppercase">{killAnalytics.top_killer_24h?.rejection_gate || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">24h Kills</span>
                <span className="font-black">{killAnalytics.top_killer_24h?.kill_count_24h || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">7d Total</span>
                <span className="font-black">{killAnalytics.overall?.total_candidates || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Kill Rate</span>
                <span className="font-black">{killAnalytics.overall?.overall_kill_rate?.toFixed(1) || 0}%</span>
              </div>
              <div className="text-[9px] text-gray-500 mt-4">
                Gate distribution: {killAnalytics.gate_stats.slice(0, 3).map(g => `${g.rejection_gate}: ${g.kill_percentage.toFixed(1)}%`).join(', ')}
              </div>
            </div>
          ) : (
            <div className="text-gray-500">Loading...</div>
          )}
        </section>

        <section className="lg:col-span-12 bg-[#111] p-6 rounded border border-[#222]">
          <h2 className="text-[10px] uppercase tracking-widest text-gray-500 mb-6 font-bold">Latest Live Signals</h2>
          <div className="space-y-2 font-mono text-xs">
            {signals.length === 0 && <div className="text-gray-500">NO DATA YET</div>}
            {signals.map((sig) => (
              <div key={String(sig.signal_id || sig.id)} className="flex items-center justify-between border-b border-[#222] py-2">
                <div className="flex gap-3">
                  <span className={sig.side === 'LONG' ? 'text-green-500 font-bold' : 'text-red-500 font-bold'}>{sig.side}</span>
                  <span>{sig.pair}</span>
                </div>
                <div className="text-gray-500">{sig.ts || sig.timestamp || 'n/a'}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
