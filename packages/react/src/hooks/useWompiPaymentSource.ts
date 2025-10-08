import { useState, useCallback } from 'react';
import type {
  PaymentSourceData,
  CreatePaymentSourceParams,
  TokenizeCardParams,
  TokenizeCardResponse,
} from '@pulgueta/wompi';
import { useWompiContext } from '../context/WompiProvider';

interface UseWompiPaymentSourceResult {
  paymentSource: PaymentSourceData | null;
  tokenizedCard: TokenizeCardResponse | null;
  loading: boolean;
  error: Error | null;
  tokenizeCard: (params: TokenizeCardParams) => Promise<TokenizeCardResponse | null>;
  createPaymentSource: (params: CreatePaymentSourceParams) => Promise<PaymentSourceData | null>;
  getPaymentSource: (id: string) => Promise<void>;
  deletePaymentSource: (id: string) => Promise<boolean>;
}

/**
 * useWompiPaymentSource - Hook for managing payment sources (saved cards)
 * 
 * @example
 * ```tsx
 * function SaveCardForm() {
 *   const { tokenizeCard, createPaymentSource, loading, error } = useWompiPaymentSource();
 *   
 *   const handleSaveCard = async (cardData) => {
 *     const token = await tokenizeCard(cardData);
 *     if (token) {
 *       await createPaymentSource({
 *         type: 'CARD',
 *         token: token.id,
 *         customer_email: 'user@example.com',
 *         acceptance_token: 'acceptance_token_here'
 *       });
 *     }
 *   };
 *   
 *   return <form onSubmit={handleSaveCard}>...</form>;
 * }
 * ```
 */
export function useWompiPaymentSource(): UseWompiPaymentSourceResult {
  const { wompi } = useWompiContext();
  const [paymentSource, setPaymentSource] = useState<PaymentSourceData | null>(null);
  const [tokenizedCard, setTokenizedCard] = useState<TokenizeCardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const tokenizeCard = useCallback(async (params: TokenizeCardParams): Promise<TokenizeCardResponse | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await wompi.paymentSources.tokenizeCard(params);
      setTokenizedCard(response.data);
      return response.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to tokenize card'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  const createPaymentSource = useCallback(async (params: CreatePaymentSourceParams): Promise<PaymentSourceData | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await wompi.paymentSources.create(params);
      setPaymentSource(response.data);
      return response.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create payment source'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  const getPaymentSource = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await wompi.paymentSources.getById(id);
      setPaymentSource(response.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch payment source'));
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  const deletePaymentSource = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      await wompi.paymentSources.remove(id);
      setPaymentSource(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to delete payment source'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  return {
    paymentSource,
    tokenizedCard,
    loading,
    error,
    tokenizeCard,
    createPaymentSource,
    getPaymentSource,
    deletePaymentSource,
  };
}
