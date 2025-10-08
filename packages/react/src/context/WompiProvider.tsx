import React, { createContext, useContext, useMemo } from 'react';
import { Wompi, type WompiOptions } from '@pulgueta/wompi';

interface WompiContextValue {
  wompi: Wompi;
}

const WompiContext = createContext<WompiContextValue | null>(null);

export interface WompiProviderProps {
  children: React.ReactNode;
  config: WompiOptions;
}

/**
 * WompiProvider - Provides Wompi client instance to React components
 * 
 * @example
 * ```tsx
 * <WompiProvider config={{ publicKey: 'pub_test_...', environment: 'sandbox' }}>
 *   <App />
 * </WompiProvider>
 * ```
 */
export function WompiProvider({ children, config }: WompiProviderProps) {
  const wompi = useMemo(() => new Wompi(config), [
    config.publicKey,
    config.privateKey,
    config.integritySecret,
    config.eventsSecret,
    config.environment,
  ]);

  return (
    <WompiContext.Provider value={{ wompi }}>
      {children}
    </WompiContext.Provider>
  );
}

/**
 * useWompiContext - Access the Wompi client from context
 */
export function useWompiContext(): WompiContextValue {
  const context = useContext(WompiContext);
  
  if (!context) {
    throw new Error('useWompiContext must be used within a WompiProvider');
  }
  
  return context;
}
