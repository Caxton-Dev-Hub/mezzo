import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mezzo.africa"),
  title: "Mezzo — Escrow for trades between strangers",
  description:
    "Mezzo holds the money and the record in the middle. Sellers document an item's condition before a buyer funds it; funds release on proof, not on promises.",
  keywords: [
    "escrow",
    "peer-to-peer",
    "marketplace",
    "evidence",
    "dispute resolution",
    "Nigeria",
    "Paystack",
  ],
  openGraph: {
    title: "Mezzo — Escrow for trades between strangers",
    description:
      "Evidence-first escrow. Money held in the middle, released on proof.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${instrument.variable} ${hanken.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
