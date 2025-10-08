import React, { useCallback } from 'react';
import { useWompiCheckout } from '@pulgueta/wompi-react';

const MOCK_PRODUCTS = [
  { id: 'p1', name: 'T-Shirt', price: 45000 },
  { id: 'p2', name: 'Mug', price: 25000 },
  { id: 'p3', name: 'Sticker Pack', price: 15000 },
];

export function Products() {
  const { status, open } = useWompiCheckout();

  const checkout = useCallback((product: { id: string; name: string; price: number }) => {
    // NOTE: in real app, fetch acceptance token and signature from server
    open({
      currency: 'COP',
      amountInCents: product.price * 100,
      reference: `order-${product.id}-${Date.now()}`,
      publicKey: 'pub_test_xxx',
      // signature, acceptanceToken, redirectUrl, etc.
    });
  }, [open]);

  return (
    <div>
      <p>Widget status: {status}</p>
      <ul style={{ display: 'grid', gap: 8, padding: 0, listStyle: 'none' }}>
        {MOCK_PRODUCTS.map((p) => (
          <li key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ width: 160 }}>{p.name}</span>
            <span>${p.price.toLocaleString('es-CO')}</span>
            <button onClick={() => checkout(p)} disabled={status !== 'ready'}>Buy</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

