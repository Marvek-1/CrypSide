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

  useEffect(() => {
    const load = async () => {
      try {
        const [statusRes, statsRes, signalsRes] = await Promise.all([
          fetch('/api/python/status', { cache: 'no-store' }),
          fetch('/api/python/stats', { cache: 'no-store' }),
          fetch('/api/python/signals?limit=10', { cache: 'no-store' }),
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

        <section className="lg:col-span-8 bg-[#111] p-6 rounded border border-[#222]">
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
