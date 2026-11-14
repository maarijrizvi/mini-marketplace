// Only sets the page title (the page itself is a client component, which can't export metadata).
// A title template here too, so the order page under it keeps the " · Mini Marketplace" suffix.
export const metadata = { title: { default: 'My orders', template: '%s · Mini Marketplace' } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
