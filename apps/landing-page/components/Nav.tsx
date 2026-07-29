"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "./Wordmark";
import { appUrl } from "../lib/app-url";

const LINKS = [
  { label: "How it works", href: "#flow" },
  { label: "Evidence", href: "#evidence" },
  { label: "Arbitration", href: "#arbitration" },
  { label: "Ledger", href: "#ledger" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        scrolled
          ? "border-b border-line-soft bg-ink/80 backdrop-blur-xl"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <a href="#top" className="text-base" aria-label="Mezzo home">
          <Wordmark />
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-fog transition-colors hover:text-vellum"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a
            href={appUrl("/login")}
            className="hidden text-sm text-fog transition-colors hover:text-vellum sm:inline"
          >
            Sign in
          </a>
          <a
            href={appUrl("/register")}
            className="rounded-full bg-vellum px-4 py-2 text-sm font-medium text-ink transition-transform hover:-translate-y-0.5"
          >
            Start an escrow
          </a>
        </div>
      </div>
    </header>
  );
}
