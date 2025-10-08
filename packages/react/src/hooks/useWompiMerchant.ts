import { useState, useCallback, useEffect } from 'react';
import type { MerchantData } from '@pulgueta/wompi';
import { useWompiContext } from '../context/WompiProvider';

interface UseWompiMerchantResult {
  merchant: MerchantData | null;
  acceptanceToken: string | null;
  loading: boolean;
  error: Error | null;
  fetchMerchant: () => Promise<void>;
}

/**
 * useWompiMerchant - Hook for merchant information and acceptance token
 * 
 * @example
 * ```tsx
 * function MerchantInfo() {
 *   const { merchant, acceptanceToken, loading, error } = useWompiMerchant();
 *   
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   
 *   return (
 *     <div>
 *       <h1>{merchant?.name}</h1>
 *       <p>Acceptance Token: {acceptanceToken}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useWompiMerchant(autoFetch = true): UseWompiMerchantResult {
  const { wompi } = useWompiContext();
  const [merchant, setMerchant] = useState<MerchantData | null>(null);
  const [acceptanceToken, setAcceptanceToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchMerchant = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await wompi.merchants.getMerchantInfo();
      setMerchant(response.data);
      setAcceptanceToken(response.data.presigned_acceptance.acceptance_token);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch merchant information'));
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  useEffect(() => {
    if (autoFetch) {
      fetchMerchant();
    }
  }, [autoFetch, fetchMerchant]);

  return {
    merchant,
    acceptanceToken,
    loading,
    error,
    fetchMerchant,
  };
}
