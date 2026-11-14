import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '../lib/providers';
import { AmbientBackground } from '../components/ambient-background';

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

const SITE_NAME = 'Mezzo Charge';
const SITE_TAGLINE = 'Power on Demand';
const SITE_DESCRIPTION =
  'Rent powerbanks instantly from our network of shops across Nigeria. Verified accounts, transparent pricing, and convenient locations.';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://charge.mezzoescrow.xyz';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ['powerbank rental', 'phone charging', 'Nigeria', 'phone accessories'],
  category: 'service',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_NG',
    url: '/',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#faf8f1',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={`${instrument.variable} ${hanken.variable} ${mono.variable}`}>
      <body>
        <AmbientBackground />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
