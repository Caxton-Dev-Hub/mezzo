'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../lib/utils';

interface AdminNavProps {
  isAdmin: boolean;
}

const ARBITER_LINKS = [{ href: '/admin', label: 'Disputes' }];

const ADMIN_LINKS = [
  { href: '/admin/escrows', label: 'Escrows' },
  { href: '/admin/at-risk', label: 'Needs attention' },
  { href: '/admin/payments', label: 'Money' },
  { href: '/admin/settings', label: 'Settings' },
];

export function AdminNav({ isAdmin }: AdminNavProps) {
  const pathname = usePathname();
  const links = isAdmin ? [...ARBITER_LINKS, ...ADMIN_LINKS] : ARBITER_LINKS;

  return (
    <nav className="mb-8 flex flex-wrap gap-1 border-b border-line-soft pb-3">
      {links.map((link) => {
        const active = link.href === '/admin' ? pathname === '/admin' : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-full px-3 py-1.5 text-[13px] transition-colors',
              active ? 'bg-surface-2 text-vellum' : 'text-mute hover:text-vellum',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
