'use client';

import { useEffect, useState } from 'react';
import { GUEST_CART_EVENT, readGuestCart } from '@/lib/guest-cart';

export function GuestCartCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(readGuestCart().reduce((a, i) => a + i.quantity, 0));
    update();
    window.addEventListener(GUEST_CART_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(GUEST_CART_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return <>{count}</>;
}
