import React, { useMemo } from 'react';
import { WompiProvider } from '@pulgueta/wompi-react';
import { Products } from './products';

export function App() {
  const options = useMemo(() => ({ publicKey: 'pub_test_xxx', environment: 'sandbox' as const }), []);
  return (
    <WompiProvider options={options}>
      <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
        <h1>Wompi React Demo</h1>
        <Products />
      </div>
    </WompiProvider>
  );
}

