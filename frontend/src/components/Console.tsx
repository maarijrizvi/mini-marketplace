'use client';
/** Sidebar layout shared by the Seller Hub and the admin console. */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

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
  // Phones: the sidebar collapses to a top bar; the links open from a Menu button.
  const [open, setOpen] = useState(false);
  const current = nav.find((n) => (n.exact ? path === n.href : path === n.href || path.startsWith(`${n.href}/`)));
  return (
    <div className="console">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className={`side ${open ? 'open' : ''}`} aria-label={`${title} navigation`}>
        <div className="side-top">
          <Link href={home} className="title" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
            <span className="mark" aria-hidden="true">
              M
            </span>
            {title}
            {current && <span className="side-current">· {current.label}</span>}
          </Link>
          <button className="link side-toggle" aria-expanded={open} aria-controls="console-nav" onClick={() => setOpen((o) => !o)}>
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
        <div id="console-nav" className="side-body" onClick={(e) => (e.target as HTMLElement).closest('a') && setOpen(false)}>
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
        </div>
      </aside>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
