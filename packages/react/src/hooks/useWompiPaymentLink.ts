import { useState, useCallback } from 'react';
import type {
  PaymentLinkData,
  CreatePaymentLinkParams,
  UpdatePaymentLinkParams,
} from '@pulgueta/wompi';
import { useWompiContext } from '../context/WompiProvider';

interface UseWompiPaymentLinkResult {
  paymentLink: PaymentLinkData | null;
  loading: boolean;
  error: Error | null;
  createPaymentLink: (params: CreatePaymentLinkParams) => Promise<PaymentLinkData | null>;
  getPaymentLink: (id: string) => Promise<void>;
  updatePaymentLink: (id: string, params: UpdatePaymentLinkParams) => Promise<PaymentLinkData | null>;
  deactivatePaymentLink: (id: string) => Promise<boolean>;
  activatePaymentLink: (id: string) => Promise<boolean>;
}

/**
 * useWompiPaymentLink - Hook for managing payment links
 * 
 * @example
 * ```tsx
 * function CreatePaymentLinkButton() {
 *   const { createPaymentLink, paymentLink, loading, error } = useWompiPaymentLink();
 *   
 *   const handleCreate = async () => {
 *     const link = await createPaymentLink({
 *       name: 'Product Payment',
 *       description: 'Payment for awesome product',
 *       single_use: true,
 *       currency: 'COP',
 *       amount_in_cents: 5000000
 *     });
 *     
 *     if (link) {
 *       console.log('Payment URL:', link.url);
 *     }
 *   };
 *   
 *   return <button onClick={handleCreate} disabled={loading}>Create Link</button>;
 * }
 * ```
 */
export function useWompiPaymentLink(): UseWompiPaymentLinkResult {
  const { wompi } = useWompiContext();
  const [paymentLink, setPaymentLink] = useState<PaymentLinkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createPaymentLink = useCallback(async (params: CreatePaymentLinkParams): Promise<PaymentLinkData | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await wompi.paymentLinks.create(params);
      setPaymentLink(response.data);
      return response.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create payment link'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  const getPaymentLink = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await wompi.paymentLinks.getById(id);
      setPaymentLink(response.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch payment link'));
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  const updatePaymentLink = useCallback(async (id: string, params: UpdatePaymentLinkParams): Promise<PaymentLinkData | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await wompi.paymentLinks.update(id, params);
      setPaymentLink(response.data);
      return response.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to update payment link'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  const deactivatePaymentLink = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      await wompi.paymentLinks.deactivate(id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to deactivate payment link'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  const activatePaymentLink = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      await wompi.paymentLinks.activate(id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to activate payment link'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  return {
    paymentLink,
    loading,
    error,
    createPaymentLink,
    getPaymentLink,
    updatePaymentLink,
    deactivatePaymentLink,
    activatePaymentLink,
  };
}
