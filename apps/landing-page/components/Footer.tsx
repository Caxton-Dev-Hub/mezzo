import { Wordmark } from "./Wordmark";

const GROUPS = [
  {
    title: "Product",
    links: ["How it works", "Evidence capture", "Arbitration", "The ledger"],
  },
  {
    title: "Company",
    links: ["About", "Security", "Careers", "Contact"],
  },
  {
    title: "Legal",
    links: ["Terms", "Privacy", "Dispute policy", "KYC & limits"],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-line-soft py-14">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Wordmark className="text-lg" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-mute">
              Evidence-first escrow for peer-to-peer trade. The neutral,
              verifiable middle between two parties.
            </p>
          </div>
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
                {group.title}
              </div>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#top"
                      className="text-sm text-fog transition-colors hover:text-vellum"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-line-soft pt-6 text-xs text-mute sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Mezzo. All rights reserved.</span>
          <span className="font-mono">mezzo — Italian for “the middle.”</span>
        </div>
      </div>
    </footer>
  );
}
