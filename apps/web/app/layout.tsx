import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '../lib/providers';

const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
});

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mezzo',
  description: 'Escrow that documents the item before money moves.',
};

export const viewport: Viewport = {
  themeColor: '#faf8f1',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${hanken.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
