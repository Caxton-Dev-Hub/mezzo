'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../lib/utils';

const SECTIONS = [
  {
    label: 'Start here',
    links: [{ href: '/docs', label: 'Overview' }],
  },
  {
    label: 'System',
    links: [
      { href: '/docs/architecture', label: 'Architecture' },
      { href: '/docs/modules', label: 'Modules' },
    ],
  },
  {
    label: 'Engineering',
    links: [{ href: '/docs/standards', label: 'Standards' }],
  },
];

export function DocsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Docs" className="space-y-7">
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-mute">
            {section.label}
          </h2>
          <ul className="mt-3 space-y-1">
            {section.links.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-md border border-transparent px-3 py-1.5 text-[13px] transition-colors',
                      active
                        ? 'border-line bg-surface text-vellum shadow-hairline'
                        : 'text-fog hover:text-vellum',
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
