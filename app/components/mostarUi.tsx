import React from 'react';

export type IconName =
  | 'activity' | 'alert' | 'brain' | 'check' | 'conduit' | 'crown' | 'eye'
  | 'flame' | 'gauge' | 'kill' | 'lock' | 'radar' | 'scroll' | 'shield'
  | 'signal' | 'skull' | 'terminal' | 'x';

export const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export function fmt(n: number) {
  return Number(n || 0).toLocaleString();
}

export function safeFixed(n: number, digits = 2) {
  return Number.isFinite(Number(n)) ? Number(n).toFixed(digits) : '0.00';
}

export function pct(n: number, digits = 1) {
  return `${Number(n || 0).toFixed(digits)}%`;
}

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  const paths: Record<IconName, React.ReactNode> = {
    activity: <><path d="M22 12h-4l-3 8L9 4l-3 8H2" /></>,
    alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    brain: <><path d="M9.5 2A3.5 3.5 0 0 0 6 5.5v.3A4 4 0 0 0 4 13a4 4 0 0 0 2 7.5" /><path d="M14.5 2A3.5 3.5 0 0 1 18 5.5v.3A4 4 0 0 1 20 13a4 4 0 0 1-2 7.5" /><path d="M8 7h2" /><path d="M14 7h2" /><path d="M9 13h6" /><path d="M12 2v20" /></>,
    check: <><circle cx="12" cy="12" r="10" /><path d="m8 12 2.5 2.5L16 9" /></>,
    conduit: <><path d="M12 2v20" /><path d="M4 7h16" /><path d="M4 17h16" /><path d="M7 7l5 5-5 5" /><path d="M17 7l-5 5 5 5" /></>,
    crown: <><path d="m2 7 5 5 5-9 5 9 5-5-2 13H4L2 7Z" /><path d="M4 20h16" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    flame: <><path d="M12 22c4 0 7-3 7-7 0-2.5-1.4-4.8-4-7 .1 2.2-1.2 3.4-2.4 4.2C11.2 9.6 9.3 7.7 10 3 7 5 5 8.5 5 15c0 4 3 7 7 7Z" /></>,
    gauge: <><path d="M12 14l4-4" /><path d="M3.3 19a9 9 0 1 1 17.4 0" /><path d="M7 19h10" /></>,
    kill: <><path d="M12 2a10 10 0 1 0 10 10" /><path d="M22 2 12 12" /><path d="m16 2 6 0 0 6" /><path d="M9 9l6 6" /><path d="m15 9-6 6" /></>,
    lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
    radar: <><path d="M12 12h.01" /><path d="M19.1 4.9A10 10 0 1 1 4.9 19.1" /><path d="M15.5 8.5A5 5 0 1 1 8.5 15.5" /><path d="M12 12 21 3" /></>,
    scroll: <><path d="M8 21h8" /><path d="M12 17v4" /><path d="M5 3h14v10a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V3Z" /><path d="M8 7h8" /><path d="M8 11h6" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-5" /></>,
    signal: <><path d="M2 20h.01" /><path d="M7 20a5 5 0 0 0-5-5" /><path d="M12 20A10 10 0 0 0 2 10" /><path d="M17 20A15 15 0 0 0 2 5" /></>,
    skull: <><path d="M12 2a8 8 0 0 0-8 8c0 3.3 2 5.8 5 7v3h6v-3c3-1.2 5-3.7 5-7a8 8 0 0 0-8-8Z" /><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M10 15h4" /></>,
    terminal: <><path d="m4 17 6-6-6-6" /><path d="M12 19h8" /></>,
    x: <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

export function Panel({
  children,
  className,
  title,
  subtitle,
  icon,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  icon?: IconName;
}) {
  return (
    <section className={cx('mostar-panel relative overflow-hidden rounded-3xl p-5', className)}>
      <div className="mostar-panel-glow pointer-events-none absolute inset-0" />
      {(title || subtitle) && (
        <div className="relative mb-5 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="mostar-text-white text-[11px] font-black uppercase tracking-[0.24em]">{title}</h2>}
            {subtitle && <p className="mostar-text-muted mt-1 text-xs">{subtitle}</p>}
          </div>
          {icon && (
            <div className="mostar-status-warning rounded-2xl p-2">
              <Icon name={icon} size={17} />
            </div>
          )}
        </div>
      )}
      <div className="relative">{children}</div>
    </section>
  );
}

export function Metric({
  label,
  value,
  tone = 'mostar-text-white',
  icon,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  icon: IconName;
  sub?: string;
}) {
  return (
    <div className="mostar-card rounded-3xl p-4">
      <div className="mostar-text-muted mb-3 flex items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-[0.2em]">{label}</div>
        <Icon name={icon} size={16} />
      </div>
      <div className={cx('text-2xl font-black tracking-tight', tone)}>{value}</div>
      {sub && <div className="mostar-text-muted mt-1 text-[11px]">{sub}</div>}
    </div>
  );
}

export function AppShell({ children, max = 'max-w-[1600px]', fullScreen = false }: { children: React.ReactNode; max?: string; fullScreen?: boolean }) {
  if (fullScreen) {
    return (
      <div className="mostar-shell flex h-screen w-full flex-col overflow-hidden">
        <div className="mostar-page-grid pointer-events-none fixed inset-0 opacity-25" />
        <div className="mostar-page-vignette pointer-events-none fixed inset-0" />
        <div className={cx('relative mx-auto flex w-full flex-1 flex-col p-4 md:p-6 lg:p-8 min-h-0', max)}>{children}</div>
      </div>
    );
  }

  return (
    <div className="mostar-shell w-full min-h-screen flex-1 overflow-x-hidden">
      <div className="mostar-page-grid pointer-events-none fixed inset-0 opacity-25" />
      <div className="mostar-page-vignette pointer-events-none fixed inset-0" />
      <div className={cx('relative mx-auto flex w-full flex-col gap-6 p-4 md:p-6 lg:p-8', max)}>{children}</div>
    </div>
  );
}
