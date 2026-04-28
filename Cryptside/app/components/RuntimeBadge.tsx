'use client';

import { useEffect, useMemo, useState } from 'react';

type RuntimeState = 'green' | 'amber' | 'red';

type StatusPayload = {
  scanner_state?: string;
  last_signal?: { ts?: string } | null;
  data_source?: 'live' | 'error';
  status?: string;
};

const POLL_MS = 30000;
const STALE_MS = 5 * 60 * 1000;

function parseTs(value: unknown): number | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export default function RuntimeBadge() {
  const [runtime, setRuntime] = useState<RuntimeState>('red');
  const [label, setLabel] = useState('API DOWN');

  useEffect(() => {
    let active = true;

    const loadStatus = async () => {
      try {
        const res = await fetch('/api/python/status', { cache: 'no-store' });
        if (!res.ok) {
          if (active) {
            setRuntime('red');
            setLabel('API DOWN');
          }
          return;
        }

        const data = (await res.json()) as StatusPayload;
        if (!active) return;

        if (data.data_source === 'error' || data.status === 'degraded') {
          setRuntime('red');
          setLabel('DEGRADED');
          return;
        }

        const scannerState = (data.scanner_state || '').toLowerCase();
        if (scannerState && scannerState !== 'running') {
          setRuntime('red');
          setLabel('SCANNER STOPPED');
          return;
        }

        const signalTs = parseTs(data?.last_signal?.ts);
        if (signalTs === null) {
          setRuntime('amber');
          setLabel('NO SIGNAL YET');
          return;
        }

        const age = Date.now() - signalTs;
        if (age > STALE_MS) {
          setRuntime('amber');
          setLabel('STALE');
          return;
        }

        setRuntime('green');
        setLabel('LIVE');
      } catch {
        if (active) {
          setRuntime('red');
          setLabel('API DOWN');
        }
      }
    };

    loadStatus();
    const timer = setInterval(loadStatus, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const classes = useMemo(() => {
    if (runtime === 'green') {
      return 'border-green-500/60 text-green-400 bg-green-950/20';
    }
    if (runtime === 'amber') {
      return 'border-amber-500/60 text-amber-300 bg-amber-950/20';
    }
    return 'border-red-500/60 text-red-400 bg-red-950/20';
  }, [runtime]);

  return (
    <div className={`px-3 py-1 rounded border text-[10px] font-black uppercase tracking-widest ${classes}`}>
      Runtime: {label}
    </div>
  );
}
