import { redirect } from 'next/navigation';

// Seller Hub (analytics, orders) arrives with the fulfilment milestone; products are ready now.
export default function SellerHome() {
  redirect('/seller/products');
}
