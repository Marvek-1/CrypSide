'use client';

import React, { useState, useEffect } from 'react';

interface ObserverSignal {
  id: string;
  pair: string;
  timestamp: string;
  side: string;
  entry: number;
  stop_loss: number;
  take_profit: number;
  score: number;
  regime: string;
  outcome?: string;
  r_multiple?: number;
}

interface ObserverStats {
  total_signals: number;
  wins: number;
  losses: number;
  expired: number;
  win_rate: number;
  profit_factor: number;
  signals_per_day: number;
}

export default function IdimIkangObserver() {
  const [signals, setSignals] = useState<ObserverSignal[]>([]);
  const [stats, setStats] = useState<ObserverStats>({
    total_signals: 0,
    wins: 0,
    losses: 0,
    expired: 0,
    win_rate: 0,
    profit_factor: 0,
    signals_per_day: 0,
  });
  const [isKilling, setIsKilling] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [scannerState, setScannerState] = useState('unknown');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const wsBase = process.env.NEXT_PUBLIC_API_WS_URL || 'ws://127.0.0.1:8787/ws';

  const loadSnapshot = async () => {
    try {
      const [signalsRes, statsRes, statusRes] = await Promise.all([
        fetch('/api/python/signals?limit=50', { cache: 'no-store' }),
        fetch('/api/python/stats', { cache: 'no-store' }),
        fetch('/api/python/status', { cache: 'no-store' }),
      ]);

      if (signalsRes.ok) {
        const data = await signalsRes.json();
        const rows = Array.isArray(data.signals) ? data.signals : [];
        setSignals(
          rows.map((d: any) => ({
            id: String(d.signal_id || d.id),
            pair: d.pair,
            timestamp: d.ts || d.timestamp,
            side: d.side,
            entry: Number(d.entry),
            stop_loss: Number(d.stop_loss),
            take_profit: Number(d.take_profit),
            score: Number(d.score),
            regime: d.regime,
            outcome: d.outcome,
            r_multiple: d.r_multiple != null ? Number(d.r_multiple) : undefined,
          })),
        );
      }

      if (statsRes.ok) {
        const payload = await statsRes.json();
        setStats({
          total_signals: Number(payload.total_signals || 0),
          wins: Number(payload.wins || 0),
          losses: Number(payload.losses || 0),
          expired: Number(payload.expired || 0),
          win_rate: Number(payload.win_rate || 0),
          profit_factor: Number(payload.profit_factor || 0),
          signals_per_day: Number(payload.signals_per_day || 0),
        });
      }

      if (statusRes.ok) {
        const status = await statusRes.json();
        setScannerState(String(status.scanner_state || 'running'));
      }

      setLastUpdatedAt(Date.now());
    } catch (error) {
      console.error('Observer snapshot load failed', error);
    }
  };

  useEffect(() => {
    const bootTimer = setTimeout(() => {
      void loadSnapshot();
    }, 0);
    const timer = setInterval(loadSnapshot, 10000);
    return () => {
      clearTimeout(bootTimer);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = new WebSocket(wsBase);

      ws.onopen = () => setApiConnected(true);
      ws.onclose = () => {
        setApiConnected(false);
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'new_signal' && payload.data) {
            const sig = payload.data;
            const newSig: ObserverSignal = {
              id: String(sig.signal_id || sig.id),
              pair: sig.pair,
              timestamp: sig.ts || sig.timestamp,
              side: sig.side,
              entry: Number(sig.entry),
              stop_loss: Number(sig.stop_loss),
              take_profit: Number(sig.take_profit),
              score: Number(sig.score),
              regime: sig.regime,
            };

            setSignals((prev) => [newSig, ...prev].slice(0, 50));
            setStats((prev) => ({ ...prev, total_signals: prev.total_signals + 1 }));
            setLastUpdatedAt(Date.now());
          }
        } catch (e) {
          console.error('WS parse error', e);
        }
      };
    };

    connect();
    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [wsBase]);

  const freshnessSeconds = lastUpdatedAt == null ? null : Math.floor((nowMs - lastUpdatedAt) / 1000);
  const freshnessClass =
    freshnessSeconds == null
      ? 'text-gray-500'
      : freshnessSeconds > 300
        ? 'text-red-400'
        : freshnessSeconds > 60
          ? 'text-amber-400'
          : 'text-green-400';

  const handleKillSwitch = async () => {
    if (!window.confirm('This will stop the scanner process. Continue?')) {
      return;
    }

    setIsKilling(true);
    try {
      const res = await fetch('/api/python/kill', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(String(err.detail || err.error || 'Kill request failed'));
      }
      setScannerState('stopped');
      await loadSnapshot();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      window.alert(`Kill switch failed: ${msg}`);
    } finally {
      setIsKilling(false);
    }
  };

  return (
    <div className="flex-1 p-6 flex flex-col gap-6">
      <header className="flex justify-between items-end mb-4 pb-4 border-b border-[#222]">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase mb-2">Idim Ikang Observer</h1>
          <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Live baseline-aligned sovereign scanning</p>
        </div>
        <div className="flex gap-4 items-center">
          <span className={`text-[10px] uppercase tracking-widest font-black ${freshnessClass}`}>
            Last updated: {freshnessSeconds == null ? 'never' : `${freshnessSeconds}s ago`}
          </span>
          <button
            onClick={handleKillSwitch}
            disabled={isKilling}
            className={`px-6 py-2 text-xs font-black uppercase tracking-tighter ${isKilling ? 'bg-[#333] text-gray-400 border border-[#444]' : 'bg-red-900/40 text-red-400 border border-red-900/60'} transition-colors`}
          >
            {isKilling ? 'STOPPING...' : 'KILL SCANNER'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-[#111] p-6 rounded border border-[#222]">
            <h2 className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-6">Observer Status</h2>
            <div className="space-y-4">
              <div>
                <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Scanner State</span>
                <span className={`font-black ${scannerState === 'running' ? 'text-green-500' : 'text-red-500'}`}>{scannerState.toUpperCase()}</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-500 uppercase tracking-widest">API Link</span>
                <span className={`font-black ${apiConnected ? 'text-green-500' : 'text-red-500'}`}>{apiConnected ? 'CONNECTED' : 'DISCONNECTED'}</span>
              </div>
            </div>
          </div>

          <div className="bg-[#111] p-6 rounded border border-[#222]">
            <h2 className="text-[10px] uppercase font-bold tracking-widest text-gray-500 mb-6">Aggregated Metrics</h2>
            <div className="grid grid-cols-2 gap-4 gap-y-6">
              <div>
                <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Total Sigs</span>
                <span className="text-xl font-black">{stats.total_signals}</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Wins</span>
                <span className="text-xl font-black text-green-400">{stats.wins}</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Losses</span>
                <span className="text-xl font-black text-red-400">{stats.losses}</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Win Rate</span>
                <span className="text-xl font-black text-white">{stats.win_rate.toFixed(2)}%</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Profit Factor</span>
                <span className="text-xl font-black text-cyan-400">{stats.profit_factor.toFixed(2)}</span>
              </div>
              <div>
                <span className="block text-[10px] text-gray-500 uppercase tracking-widest">Sigs / Day</span>
                <span className="text-xl font-black text-cyan-400">{stats.signals_per_day.toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="bg-[#111] border border-[#222] rounded flex-1 flex flex-col">
            <div className="p-4 border-b border-[#222]">
              <h2 className="text-[10px] uppercase font-bold tracking-widest text-gray-500">Live Signals Target Feed</h2>
            </div>
            <div className="p-0 overflow-x-auto text-xs">
              <table className="w-full text-left font-mono whitespace-nowrap">
                <thead className="bg-[#1a1a1a] text-gray-500 uppercase tracking-widest text-[9px]">
                  <tr>
                    <th className="px-4 py-3 font-normal">Timestamp</th>
                    <th className="px-4 py-3 font-normal">Pair</th>
                    <th className="px-4 py-3 font-normal">Side</th>
                    <th className="px-4 py-3 font-normal text-right">Entry</th>
                    <th className="px-4 py-3 font-normal text-right">SL / TP</th>
                    <th className="px-4 py-3 font-normal text-right">Score</th>
                    <th className="px-4 py-3 font-normal">Regime</th>
                    <th className="px-4 py-3 font-normal">Outcome</th>
                    <th className="px-4 py-3 font-normal text-right">R-Mult</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222]">
                  {signals.map((sig) => (
                    <tr key={sig.id} className="hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-4 py-3 text-gray-400">{new Date(sig.timestamp).toLocaleTimeString()}</td>
                      <td className="px-4 py-3 font-bold text-white">{sig.pair}</td>
                      <td className={`px-4 py-3 font-bold ${sig.side === 'LONG' ? 'text-green-500' : 'text-red-500'}`}>{sig.side}</td>
                      <td className="px-4 py-3 text-right text-gray-200">{sig.entry.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        <span className="text-red-400/80">{sig.stop_loss.toFixed(2)}</span> / <span className="text-green-400/80">{sig.take_profit.toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-cyan-400">{sig.score}</td>
                      <td className="px-4 py-3 text-gray-400 text-[10px]">{sig.regime}</td>
                      <td className="px-4 py-3 text-gray-400 text-[10px]">{sig.outcome || '-'}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{sig.r_multiple != null ? sig.r_multiple.toFixed(2) : '-'}</td>
                    </tr>
                  ))}
                  {signals.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-gray-600 tracking-widest">NO LIVE SIGNALS YET</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
