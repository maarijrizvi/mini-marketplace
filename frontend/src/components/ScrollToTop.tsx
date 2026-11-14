'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/** A new page opens at the top, even when the previous one was scrolled (Next keeps shared layouts in place). */
export function ScrollToTop() {
  const path = usePathname();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);
  return null;
}
