/**
 * Example usage of the Wompi SDK
 */
import { Wompi } from '@pulgueta/wompi';

// Initialize the SDK
const wompi = new Wompi({
  publicKey: 'pub_test_tXJ38hUTUENYYfa2V3m3fKHQzwA7bxju',
  privateKey: 'prv_test_...',
  integritySecret: 'test_integrity_...',
  eventsSecret: 'test_events_...',
  environment: 'sandbox',
});

async function examples() {
  // 1. Get merchant information
  console.log('=== Merchant Information ===');
  const merchant = await wompi.merchants.getMerchantInfo();
  console.log('Merchant:', merchant.data.name);
  console.log('Acceptance Token:', merchant.data.presigned_acceptance.acceptance_token);

  // 2. Get PSE financial institutions
  console.log('\n=== PSE Financial Institutions ===');
  const institutions = await wompi.pse.getFinancialInstitutions();
  console.log('Total institutions:', institutions.data.length);
  console.log('First institution:', institutions.data[0]);

  // 3. Tokenize a card
  console.log('\n=== Tokenize Card ===');
  const token = await wompi.paymentSources.tokenizeCard({
    number: '4242424242424242',
    cvc: '123',
    exp_month: '12',
    exp_year: '2028',
    card_holder: 'John Doe',
  });
  console.log('Token ID:', token.data.id);

  // 4. Create a payment source
  console.log('\n=== Create Payment Source ===');
  const paymentSource = await wompi.paymentSources.create({
    type: 'CARD',
    token: token.data.id,
    customer_email: 'customer@example.com',
    acceptance_token: merchant.data.presigned_acceptance.acceptance_token,
  });
  console.log('Payment Source ID:', paymentSource.data.id);

  // 5. Create a transaction
  console.log('\n=== Create Transaction ===');
  const transaction = await wompi.transactions.create({
    amount_in_cents: 5000000,
    currency: 'COP',
    customer_email: 'customer@example.com',
    payment_method: {
      type: 'CARD',
      token: token.data.id,
      installments: 1,
    },
    reference: `ORDER-${Date.now()}`,
  });
  console.log('Transaction ID:', transaction.data.id);
  console.log('Transaction Status:', transaction.data.status);

  // 6. Get transaction
  console.log('\n=== Get Transaction ===');
  const fetchedTransaction = await wompi.transactions.getById(transaction.data.id);
  console.log('Fetched Transaction:', fetchedTransaction.data.id);

  // 7. List transactions
  console.log('\n=== List Transactions ===');
  const transactions = await wompi.transactions.list({
    page: 1,
    page_size: 10,
    status: 'APPROVED',
  });
  console.log('Total transactions fetched:', Array.isArray(transactions.data) ? transactions.data.length : 0);

  // 8. Create payment link
  console.log('\n=== Create Payment Link ===');
  const paymentLink = await wompi.paymentLinks.create({
    name: 'Product Payment',
    description: 'Payment for awesome product',
    single_use: true,
    currency: 'COP',
    amount_in_cents: 5000000,
  });
  console.log('Payment Link URL:', paymentLink.data.url);

  // 9. Generate integrity signature
  console.log('\n=== Generate Integrity Signature ===');
  const signature = await wompi.getIntegritySignature('ORDER-123', 5000000);
  console.log('Integrity Signature:', signature);

  // 10. Webhook verification example
  console.log('\n=== Webhook Verification (Example) ===');
  const webhookPayload = {
    event: 'transaction.updated',
    data: {
      transaction: {
        id: 'txn_123',
        amount_in_cents: 5000000,
        reference: 'ORDER-123',
        customer_email: 'customer@example.com',
        currency: 'COP',
        payment_method_type: 'CARD',
        redirect_url: null,
        status: 'APPROVED',
        shipping_address: null,
        payment_link_id: null,
        payment_source_id: null,
      },
    },
    sent_at: '2024-01-01T00:00:00.000Z',
    timestamp: Date.now(),
    signature: {
      checksum: 'abc123',
      properties: ['data.transaction.id', 'data.transaction.status'],
    },
    environment: 'test',
  };
  
  try {
    const verifiedEvent = await wompi.events.constructEvent(
      JSON.stringify(webhookPayload),
      'signature_from_headers'
    );
    console.log('Webhook verified successfully:', verifiedEvent.event);
  } catch (error) {
    console.log('Webhook verification failed (expected in this example):', error.message);
  }
}

// Run examples
examples().catch(console.error);
