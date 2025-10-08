import { useState, useCallback, useEffect } from 'react';
import type { FinancialInstitution } from '@pulgueta/wompi';
import { useWompiContext } from '../context/WompiProvider';

interface UseWompiPSEResult {
  institutions: FinancialInstitution[] | null;
  loading: boolean;
  error: Error | null;
  fetchInstitutions: () => Promise<void>;
}

/**
 * useWompiPSE - Hook for PSE (Colombian bank transfer) operations
 * 
 * @example
 * ```tsx
 * function PSESelector() {
 *   const { institutions, loading, error } = useWompiPSE();
 *   
 *   if (loading) return <div>Loading banks...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   
 *   return (
 *     <select>
 *       {institutions?.map(inst => (
 *         <option key={inst.financial_institution_code} value={inst.financial_institution_code}>
 *           {inst.financial_institution_name}
 *         </option>
 *       ))}
 *     </select>
 *   );
 * }
 * ```
 */
export function useWompiPSE(autoFetch = true): UseWompiPSEResult {
  const { wompi } = useWompiContext();
  const [institutions, setInstitutions] = useState<FinancialInstitution[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchInstitutions = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await wompi.pse.getFinancialInstitutions();
      setInstitutions(response.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch financial institutions'));
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  useEffect(() => {
    if (autoFetch) {
      fetchInstitutions();
    }
  }, [autoFetch, fetchInstitutions]);

  return {
    institutions,
    loading,
    error,
    fetchInstitutions,
  };
}
