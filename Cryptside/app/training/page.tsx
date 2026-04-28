'use client';

import React, { useEffect, useState } from 'react';

type Stats = {
  total_signals: number;
  wins: number;
  losses: number;
  win_rate: number;
  profit_factor: number;
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

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, statusRes] = await Promise.all([
          fetch('/api/python/stats', { cache: 'no-store' }),
          fetch('/api/python/status', { cache: 'no-store' }),
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
        <h1 className="text-3xl font-black tracking-tighter uppercase mb-4">Training Console</h1>
        <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Read-only observer analytics · no synthetic training simulation</div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
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
    </div>
  );
}
