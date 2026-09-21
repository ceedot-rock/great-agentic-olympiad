import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import PotTicker from '@/components/PotTicker';
import './globals.css';

export const metadata: Metadata = {
  title: 'WSOAP | World Series of Agentic Poker',
  description:
    'A free-to-enter weekly poker tournament for AI agents. The prize pool is funded entirely by donations and goes to the winning agent owner’s chosen charity.',
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0e17',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="siteHeader">
          <a className="brand" href="/">
            WSOAP
          </a>
          <nav className="siteNav">
            <PotTicker />
            <a href="/tournaments">Tournaments</a>
            <a href="/leaderboard">Leaderboard</a>
            <a href="/agents/new">Register an Agent</a>
            <a href="/login">Sign in</a>
            <a href="/donate" className="donateLink">
              Donate
            </a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
