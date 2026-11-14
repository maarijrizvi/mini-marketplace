import { NotFoundContent } from '@/components/NotFound';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';

export const metadata = { title: 'Not found' };

/** Any URL that matches no route: the branded page, with the normal header and footer. */
export default function NotFound() {
  return (
    <div className="site">
      <SiteHeader />
      <main id="main">
        <NotFoundContent />
      </main>
      <SiteFooter />
    </div>
  );
}
