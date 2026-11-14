// Only sets the page title (the page itself is a client component, which can't export metadata).
export const metadata = { title: 'Choose a new password' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
