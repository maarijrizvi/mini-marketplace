import Link from 'next/link';

export function AuthShell(props: { eyebrow: string; title: string; points?: string[]; foot?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <Link href="/" className="brand">
          <span className="mark" aria-hidden="true">
            M
          </span>
          Mini Marketplace
        </Link>
        <div style={{ position: 'relative' }}>
          <div className="eyebrow">{props.eyebrow}</div>
          <h1>{props.title}</h1>
          {props.points && (
            <ul>
              {props.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
        {props.foot && <div className="foot">{props.foot}</div>}
        <span className="ring" aria-hidden="true" />
      </aside>
      <main className="auth-main">{props.children}</main>
    </div>
  );
}
