import { ScrollToTop } from '@/components/ScrollToTop';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <ScrollToTop />
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
