import { useState, useCallback } from 'react';
import type {
  TransactionData,
  GetTransactionsParams,
  CreateTransactionParams,
  WompiResponse,
} from '@pulgueta/wompi';
import { useWompiContext } from '../context/WompiProvider';

interface UseWompiTransactionResult {
  transaction: TransactionData | null;
  transactions: TransactionData[] | null;
  loading: boolean;
  error: Error | null;
  getTransaction: (id: string) => Promise<void>;
  listTransactions: (params?: GetTransactionsParams) => Promise<void>;
  createTransaction: (params: CreateTransactionParams) => Promise<TransactionData | null>;
}

/**
 * useWompiTransaction - Hook for managing transactions
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { transaction, loading, error, getTransaction } = useWompiTransaction();
 *   
 *   useEffect(() => {
 *     getTransaction('txn_123');
 *   }, []);
 *   
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   
 *   return <div>{transaction?.status}</div>;
 * }
 * ```
 */
export function useWompiTransaction(): UseWompiTransactionResult {
  const { wompi } = useWompiContext();
  const [transaction, setTransaction] = useState<TransactionData | null>(null);
  const [transactions, setTransactions] = useState<TransactionData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const getTransaction = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await wompi.transactions.getById(id);
      setTransaction(response.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch transaction'));
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  const listTransactions = useCallback(async (params?: GetTransactionsParams) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await wompi.transactions.list(params);
      setTransactions(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch transactions'));
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  const createTransaction = useCallback(async (params: CreateTransactionParams): Promise<TransactionData | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await wompi.transactions.create(params);
      setTransaction(response.data);
      return response.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to create transaction'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [wompi]);

  return {
    transaction,
    transactions,
    loading,
    error,
    getTransaction,
    listTransactions,
    createTransaction,
  };
}
