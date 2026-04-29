import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import Link from 'next/link';
import './globals.css';
import RuntimeBadge from './components/RuntimeBadge';

export const metadata: Metadata = {
  title: 'MoStar CrypSide',
  description: 'MoStar sovereign scanner, ingestion, training, observer, and live terminal.',
};

const navItems = [
  {href: '/', label: 'Home'},
  {href: '/ingestion', label: 'Ingestion'},
  {href: '/training', label: 'Training'},
  {href: '/observer', label: 'Observer'},
  {href: '/live', label: 'Live'},
  {href: '/live-engine', label: 'Live Engine'},
  {href: '/live-trading', label: 'Live Trading'},
];

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (typeof window !== 'undefined') {
                  const getPropDesc = (obj, prop) => {
                    while (obj) {
                      const desc = Object.getOwnPropertyDescriptor(obj, prop);
                      if (desc) return desc;
                      obj = Object.getPrototypeOf(obj);
                    }
                  };
                  const desc = getPropDesc(window, 'fetch');
                  if (desc && !desc.set) {
                    let fetchRef = desc.value || desc.get?.call(window);
                    Object.defineProperty(window, 'fetch', {
                      configurable: true,
                      enumerable: true,
                      get: () => fetchRef,
                      set: (val) => { fetchRef = val; }
                    });
                  }
                }
              } catch (e) {
                console.error('Fetch patch error:', e);
              }
            `
          }}
        />
      </head>
      <body className="mostar-app-body font-sans" suppressHydrationWarning>
        <header className="mostar-root-header">
          <div className="mostar-root-inner">
            <Link href="/" className="mostar-root-brand" aria-label="MoStar CrypSide home">
              <span className="mostar-root-brand-mark">Mo</span>
              <span>
                <span className="block text-base leading-none">MoStar</span>
                <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-[var(--mostar-gold)]">
                  CrypSide
                </span>
              </span>
            </Link>

            <nav className="mostar-root-nav" aria-label="Primary navigation">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="mostar-root-nav-link">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="mostar-root-status">
            <RuntimeBadge />
            <span className="mostar-pill mostar-pill-gold px-3 py-1 text-[10px]">Node Secure</span>
          </div>
        </header>

        <div className="mostar-root-main">
          {children}
        </div>

        <footer className="mostar-root-footer">
          <div className="flex flex-wrap gap-3">
            <span>Routes: Connected</span>
            <span className="mostar-text-live">Frontend: Online</span>
          </div>
          <div>MoStar Industries / Sovereign Scanner Console</div>
        </footer>
      </body>
    </html>
  );
}
