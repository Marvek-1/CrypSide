'use client';

import React, { useEffect, useState } from 'react';

type Signal = {
  signal_id?: string;
  id?: string;
  ts?: string;
  timestamp?: string;
  pair: string;
  side: string;
  score: number;
};

type Stats = {
  total_signals: number;
  win_rate: number;
  profit_factor: number;
  signals_per_day: number;
};

export default function LiveExecutionTerminal() {
  const [statusText, setStatusText] = useState('loading');
  const [stats, setStats] = useState<Stats>({
    total_signals: 0,
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
          fetch('/api/python/signals?limit=25', { cache: 'no-store' }),
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
    <div className="flex-1 p-6 flex flex-col gap-6 max-w-[1400px] mx-auto w-full">
      <header className="flex justify-between items-start border-b border-[#222] pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase mb-2">Live Terminal</h1>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Observer data only · no execution simulation</div>
        </div>
        <div className="px-3 py-1 rounded border border-[#333] text-[10px] font-black uppercase tracking-widest">Scanner: {statusText}</div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-4 bg-[#111] p-6 rounded border border-[#222]">
          <h2 className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-6">Live Metrics</h2>
          <div className="space-y-5">
            <div className="flex justify-between"><span className="text-gray-400">Total Signals</span><span className="font-black">{stats.total_signals}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Win Rate</span><span className="font-black">{stats.win_rate.toFixed(2)}%</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Profit Factor</span><span className="font-black">{stats.profit_factor.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Signals / Day</span><span className="font-black">{stats.signals_per_day.toFixed(2)}</span></div>
          </div>
        </section>

        <section className="lg:col-span-8 bg-[#111] border border-[#222] rounded">
          <div className="p-4 border-b border-[#222]"><h2 className="text-[10px] uppercase font-bold tracking-widest text-gray-500">Latest Signals</h2></div>
          <div className="p-4 space-y-2 font-mono text-xs">
            {signals.length === 0 && <div className="text-gray-600">NO LIVE DATA YET</div>}
            {signals.map((sig) => (
              <div key={String(sig.signal_id || sig.id)} className="flex justify-between border-b border-[#222] py-2">
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
