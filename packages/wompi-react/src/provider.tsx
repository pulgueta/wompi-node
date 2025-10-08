import React, { createContext, useContext, useMemo } from 'react';
import { Wompi, type WompiOptions } from '@pulgueta/wompi';

const WompiContext = createContext<Wompi | null>(null);

export type WompiProviderProps = React.PropsWithChildren<{ options: WompiOptions }>;

export function WompiProvider({ options, children }: WompiProviderProps) {
  const wompi = useMemo(() => new Wompi(options), [options.publicKey, options.privateKey, options.environment, options.baseUrl]);
  return <WompiContext.Provider value={wompi}>{children}</WompiContext.Provider>;
}

export function useWompi() {
  const ctx = useContext(WompiContext);
  if (!ctx) throw new Error('useWompi must be used within <WompiProvider>');
  return ctx;
}

