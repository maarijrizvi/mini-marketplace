'use client';
/** Sidebar layout shared by the Seller Hub and the admin console. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export type NavItem = { href: string; label: string; exact?: boolean };

export function Console({
  title,
  home,
  nav,
  badge,
  person,
  footer,
  children,
}: {
  title: string;
  home: string;
  nav: NavItem[];
  badge?: ReactNode;
  person: { name: string; initials: string; note?: string };
  footer?: ReactNode;
  children: ReactNode;
}) {
  const path = usePathname();
  return (
    <div className="console">
      <aside className="side" aria-label={`${title} navigation`}>
        <Link href={home} className="title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="mark" aria-hidden="true">
            M
          </span>
          {title}
        </Link>
        {badge}
        {nav.map((n) => {
          const on = n.exact ? path === n.href : path === n.href || path.startsWith(`${n.href}/`);
          return (
            <Link key={n.href} href={n.href} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
              {n.label}
            </Link>
          );
        })}
        <div className="foot">
          {footer}
          <div className="row" style={{ padding: '8px 12px', color: '#fff', fontSize: 14, gap: 10 }}>
            <span className="avatar" aria-hidden="true">
              {person.initials}
            </span>
            <span style={{ lineHeight: 1.25 }}>
              {person.name}
              {person.note && (
                <>
                  <br />
                  <span style={{ fontSize: 12, color: '#C9D2E3' }}>{person.note}</span>
                </>
              )}
            </span>
          </div>
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}
