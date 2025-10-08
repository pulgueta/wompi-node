/**
 * Example React usage of the Wompi React SDK
 */
import React, { useState } from 'react';
import {
  WompiProvider,
  useWompiTransaction,
  useWompiPaymentSource,
  useWompiPaymentLink,
  useWompiPSE,
  useWompiMerchant,
} from '@pulgueta/wompi-react';

// App wrapper with WompiProvider
export function App() {
  return (
    <WompiProvider
      config={{
        publicKey: 'pub_test_tXJ38hUTUENYYfa2V3m3fKHQzwA7bxju',
        privateKey: 'prv_test_...',
        environment: 'sandbox',
      }}
    >
      <PaymentApp />
    </WompiProvider>
  );
}

// Main payment application
function PaymentApp() {
  return (
    <div>
      <h1>Wompi Payment Examples</h1>
      <MerchantInfo />
      <PSEInstitutions />
      <CreatePayment />
      <PaymentLinkCreator />
    </div>
  );
}

// Merchant information component
function MerchantInfo() {
  const { merchant, acceptanceToken, loading, error } = useWompiMerchant();

  if (loading) return <div>Loading merchant info...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Merchant Information</h2>
      <p>Name: {merchant?.name}</p>
      <p>Email: {merchant?.email}</p>
      <p>Acceptance Token: {acceptanceToken}</p>
    </div>
  );
}

// PSE financial institutions
function PSEInstitutions() {
  const { institutions, loading, error } = useWompiPSE();

  if (loading) return <div>Loading banks...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>PSE Banks</h2>
      <select>
        <option value="">Select a bank</option>
        {institutions?.map((inst) => (
          <option
            key={inst.financial_institution_code}
            value={inst.financial_institution_code}
          >
            {inst.financial_institution_name}
          </option>
        ))}
      </select>
    </div>
  );
}

// Payment creation component
function CreatePayment() {
  const { createTransaction, loading, error, transaction } = useWompiTransaction();
  const { tokenizeCard, tokenizedCard } = useWompiPaymentSource();
  const { acceptanceToken } = useWompiMerchant();

  const [cardData, setCardData] = useState({
    number: '4242424242424242',
    cvc: '123',
    exp_month: '12',
    exp_year: '2028',
    card_holder: 'John Doe',
  });

  const handlePayment = async () => {
    // Step 1: Tokenize the card
    const token = await tokenizeCard(cardData);
    
    if (!token) {
      console.error('Failed to tokenize card');
      return;
    }

    // Step 2: Create the transaction
    await createTransaction({
      amount_in_cents: 5000000,
      currency: 'COP',
      customer_email: 'customer@example.com',
      payment_method: {
        type: 'CARD',
        token: token.id,
        installments: 1,
      },
      reference: `ORDER-${Date.now()}`,
    });
  };

  return (
    <div>
      <h2>Create Payment</h2>
      <button onClick={handlePayment} disabled={loading}>
        {loading ? 'Processing...' : 'Pay $50,000 COP'}
      </button>
      
      {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}
      {transaction && (
        <div>
          <h3>Transaction Created!</h3>
          <p>ID: {transaction.id}</p>
          <p>Status: {transaction.status}</p>
          <p>Amount: {transaction.amount_in_cents / 100} COP</p>
        </div>
      )}
    </div>
  );
}

// Payment link creator
function PaymentLinkCreator() {
  const { createPaymentLink, paymentLink, loading, error } = useWompiPaymentLink();

  const handleCreateLink = async () => {
    await createPaymentLink({
      name: 'Product Payment',
      description: 'Payment for awesome product',
      single_use: true,
      currency: 'COP',
      amount_in_cents: 5000000,
    });
  };

  return (
    <div>
      <h2>Create Payment Link</h2>
      <button onClick={handleCreateLink} disabled={loading}>
        {loading ? 'Creating...' : 'Create Payment Link'}
      </button>
      
      {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}
      {paymentLink && (
        <div>
          <h3>Payment Link Created!</h3>
          <p>URL: <a href={paymentLink.url} target="_blank" rel="noopener noreferrer">{paymentLink.url}</a></p>
          <p>Name: {paymentLink.name}</p>
          <p>Amount: {paymentLink.amount_in_cents / 100} COP</p>
        </div>
      )}
    </div>
  );
}
