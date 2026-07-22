import { createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import {
  createDispersion,
  getPayoutStatus,
  listAccounts,
  listBanks,
  resolveKey,
} from '#/server/payouts'
import type {
  AccountDto,
  BankDto,
  KeyResolutionDto,
  PayoutStatusDto,
  ResolveKeyInput,
} from '#/server/payouts'

const KEY_TYPES = [
  'ALPHANUMERIC',
  'MAIL',
  'PHONE',
  'IDENTIFICATION',
  'ESTABLISHMENT_CODE',
] as const

const LEGAL_ID_TYPES = ['CC', 'CE', 'NIT', 'PP', 'TI', 'DNI'] as const
const ACCOUNT_TYPES = ['AHORROS', 'CORRIENTE'] as const

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
})

export const Route = createFileRoute('/')({ component: Home })

function formatBalance(balanceInCents: number | undefined) {
  return balanceInCents === undefined
    ? 'Balance unavailable'
    : copFormatter.format(balanceInCents / 100)
}

function getRequestError(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.'
}

function Home() {
  const [accounts, setAccounts] = useState<AccountDto[]>([])
  const [accountsError, setAccountsError] = useState<string | null>(null)
  const [accountsLoading, setAccountsLoading] = useState(false)

  async function handleLoadAccounts() {
    setAccountsLoading(true)
    setAccountsError(null)

    try {
      const result = await listAccounts()

      if (result.error) {
        setAccounts([])
        setAccountsError(result.error)
      } else if (result.data) {
        setAccounts(result.data)
      } else {
        setAccountsError('Wompi did not return any account data.')
      }
    } catch (error) {
      setAccounts([])
      setAccountsError(getRequestError(error))
    } finally {
      setAccountsLoading(false)
    }
  }

  return (
    <main>
      <header className="page-header">
        <p className="eyebrow">Wompi sandbox</p>
        <h1>Payouts example</h1>
        <p>
          Load an origin account, resolve a BRE-B key, and create a single bank
          or BRE-B dispersion with the <code>@pulgueta/wompi</code> SDK.
        </p>
      </header>

      <section aria-labelledby="accounts-heading">
        <div className="section-heading">
          <div>
            <h2 id="accounts-heading">Accounts</h2>
            <p>Origin accounts available to fund a payout.</p>
          </div>
          <button
            type="button"
            onClick={handleLoadAccounts}
            disabled={accountsLoading}
          >
            {accountsLoading ? 'Loading…' : 'Load accounts'}
          </button>
        </div>

        {accountsError ? (
          <p className="error" role="alert">
            {accountsError}
          </p>
        ) : null}

        {accounts.length > 0 ? (
          <ul className="account-list">
            {accounts.map((account) => (
              <li key={account.id}>
                <code>{account.id}</code>
                <span>{formatBalance(account.balanceInCents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No accounts loaded.</p>
        )}
      </section>

      <BrebDispersion accounts={accounts} />
      <BankDispersion accounts={accounts} />
    </main>
  )
}

function AccountSelect({ accounts }: { accounts: AccountDto[] }) {
  return (
    <label>
      Origin account
      <select name="accountId" required disabled={accounts.length === 0}>
        <option value="">Select an account</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.id} — {formatBalance(account.balanceInCents)}
          </option>
        ))}
      </select>
    </label>
  )
}

function PayoutResult({
  payoutId,
  status,
  error,
  refreshing,
  onRefresh,
}: {
  payoutId: string
  status: PayoutStatusDto | null
  error: string | null
  refreshing: boolean
  onRefresh: () => void
}) {
  return (
    <div className="payout-result" aria-live="polite">
      <p>
        <strong>Payout ID</strong>
        <code>{payoutId}</code>
      </p>
      <button type="button" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing…' : 'Refresh status'}
      </button>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {status ? (
        <dl className="status-details">
          <div>
            <dt>Status</dt>
            <dd>{status.status}</dd>
          </div>
          {status.reference ? (
            <div>
              <dt>Reference</dt>
              <dd>{status.reference}</dd>
            </div>
          ) : null}
          {status.createdAt ? (
            <div>
              <dt>Created</dt>
              <dd>{status.createdAt}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  )
}

function BrebDispersion({ accounts }: { accounts: AccountDto[] }) {
  type KeyType = NonNullable<ResolveKeyInput['keyType']>

  const [key, setKey] = useState('')
  const [keyType, setKeyType] = useState<KeyType | ''>('')
  const [resolution, setResolution] = useState<KeyResolutionDto | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [payoutId, setPayoutId] = useState<string | null>(null)
  const [status, setStatus] = useState<PayoutStatusDto | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function handleResolve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResolving(true)
    setResolveError(null)
    setResolution(null)

    const data: ResolveKeyInput = {
      key: key.trim(),
      ...(keyType ? { keyType } : {}),
    }

    try {
      const result = await resolveKey({ data })

      if (result.error) {
        setResolveError(result.error)
      } else if (result.data) {
        setResolution(result.data)
      } else {
        setResolveError('Wompi did not return a key resolution.')
      }
    } catch (error) {
      setResolveError(getRequestError(error))
    } finally {
      setResolving(false)
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    setCreating(true)
    setCreateError(null)
    setPayoutId(null)
    setStatus(null)
    setStatusError(null)

    try {
      const result = await createDispersion({
        data: {
          accountId: String(formData.get('accountId')),
          reference: String(formData.get('reference')).trim(),
          transaction: {
            key: key.trim(),
            name: String(formData.get('name')).trim(),
            email: String(formData.get('email')).trim(),
            amount: Number(formData.get('amount')),
          },
        },
      })

      if (result.error) {
        setCreateError(result.error)
      } else if (result.data?.payoutId) {
        setPayoutId(result.data.payoutId)
      } else {
        setCreateError('Wompi did not return a payout ID.')
      }
    } catch (error) {
      setCreateError(getRequestError(error))
    } finally {
      setCreating(false)
    }
  }

  async function handleRefreshStatus() {
    if (!payoutId) return

    setRefreshing(true)
    setStatusError(null)

    try {
      const result = await getPayoutStatus({ data: { payoutId } })

      if (result.error) {
        setStatusError(result.error)
      } else if (result.data) {
        setStatus(result.data)
      } else {
        setStatusError('Wompi did not return a payout status.')
      }
    } catch (error) {
      setStatusError(getRequestError(error))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section aria-labelledby="breb-heading">
      <div className="section-heading">
        <div>
          <h2 id="breb-heading">BRE-B dispersion</h2>
          <p>Resolve the key before confirming its beneficiary and payout.</p>
        </div>
      </div>

      <form className="form-grid" onSubmit={handleResolve}>
        <label>
          BRE-B key
          <input
            name="key"
            value={key}
            onChange={(event) => {
              setKey(event.currentTarget.value)
              setResolution(null)
              setResolveError(null)
            }}
            placeholder="ecolon@wompi.com"
            required
          />
        </label>
        <label>
          Key type <span className="optional">optional</span>
          <select
            name="keyType"
            value={keyType}
            onChange={(event) => {
              setKeyType(event.currentTarget.value as KeyType | '')
              setResolution(null)
              setResolveError(null)
            }}
          >
            <option value="">Auto-detect</option>
            {KEY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button type="submit" disabled={resolving}>
            {resolving ? 'Resolving…' : 'Resolve'}
          </button>
        </div>
      </form>

      {resolveError ? (
        <p className="error" role="alert">
          {resolveError}
        </p>
      ) : null}

      {resolution ? (
        <>
          <dl className="resolution-details" aria-live="polite">
            <div>
              <dt>Masked holder</dt>
              <dd>{resolution.holderName || 'Not provided'}</dd>
            </div>
            <div>
              <dt>Financial entity</dt>
              <dd>
                {resolution.financialEntityName || 'Not provided'}
                {resolution.financialEntityCode
                  ? ` (${resolution.financialEntityCode})`
                  : ''}
              </dd>
            </div>
            <div>
              <dt>Resolved key</dt>
              <dd>{resolution.keyValue || key}</dd>
            </div>
            <div>
              <dt>Key type</dt>
              <dd>{resolution.keyType || keyType || 'Auto-detected'}</dd>
            </div>
          </dl>

          <form className="form-grid confirm-form" onSubmit={handleCreate}>
            <h3>Confirm dispersion</h3>
            <label>
              Beneficiary name
              <input name="name" autoComplete="name" required />
            </label>
            <label>
              Beneficiary email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Amount (COP cents)
              <input name="amount" type="number" min="1" step="1" required />
            </label>
            <AccountSelect accounts={accounts} />
            <label className="full-width">
              Reference
              <input name="reference" placeholder="breb-demo-001" required />
            </label>
            {accounts.length === 0 ? (
              <p className="hint full-width">Load an origin account first.</p>
            ) : null}
            <div className="form-actions full-width">
              <button
                type="submit"
                disabled={creating || accounts.length === 0}
              >
                {creating ? 'Creating…' : 'Create BRE-B dispersion'}
              </button>
            </div>
          </form>

          {createError ? (
            <p className="error" role="alert">
              {createError}
            </p>
          ) : null}
        </>
      ) : null}

      {payoutId ? (
        <PayoutResult
          payoutId={payoutId}
          status={status}
          error={statusError}
          refreshing={refreshing}
          onRefresh={handleRefreshStatus}
        />
      ) : null}
    </section>
  )
}

function BankDispersion({ accounts }: { accounts: AccountDto[] }) {
  const [banks, setBanks] = useState<BankDto[]>([])
  const [banksError, setBanksError] = useState<string | null>(null)
  const [banksLoading, setBanksLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [payoutId, setPayoutId] = useState<string | null>(null)
  const [status, setStatus] = useState<PayoutStatusDto | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function handleLoadBanks() {
    setBanksLoading(true)
    setBanksError(null)

    try {
      const result = await listBanks()

      if (result.error) {
        setBanks([])
        setBanksError(result.error)
      } else if (result.data) {
        setBanks(result.data)
      } else {
        setBanksError('Wompi did not return any bank data.')
      }
    } catch (error) {
      setBanks([])
      setBanksError(getRequestError(error))
    } finally {
      setBanksLoading(false)
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email')).trim()

    setCreating(true)
    setCreateError(null)
    setPayoutId(null)
    setStatus(null)
    setStatusError(null)

    try {
      const result = await createDispersion({
        data: {
          accountId: String(formData.get('accountId')),
          reference: String(formData.get('reference')).trim(),
          transaction: {
            legalIdType: String(formData.get('legalIdType')) as (typeof LEGAL_ID_TYPES)[number],
            legalId: String(formData.get('legalId')).trim(),
            bankId: String(formData.get('bankId')),
            accountType: String(formData.get('accountType')) as (typeof ACCOUNT_TYPES)[number],
            accountNumber: String(formData.get('accountNumber')).trim(),
            name: String(formData.get('name')).trim(),
            amount: Number(formData.get('amount')),
            ...(email ? { email } : {}),
          },
        },
      })

      if (result.error) {
        setCreateError(result.error)
      } else if (result.data?.payoutId) {
        setPayoutId(result.data.payoutId)
      } else {
        setCreateError('Wompi did not return a payout ID.')
      }
    } catch (error) {
      setCreateError(getRequestError(error))
    } finally {
      setCreating(false)
    }
  }

  async function handleRefreshStatus() {
    if (!payoutId) return

    setRefreshing(true)
    setStatusError(null)

    try {
      const result = await getPayoutStatus({ data: { payoutId } })

      if (result.error) {
        setStatusError(result.error)
      } else if (result.data) {
        setStatus(result.data)
      } else {
        setStatusError('Wompi did not return a payout status.')
      }
    } catch (error) {
      setStatusError(getRequestError(error))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section aria-labelledby="bank-heading">
      <div className="section-heading">
        <div>
          <h2 id="bank-heading">Bank dispersion</h2>
          <p>Send one sandbox transaction to a Colombian bank account.</p>
        </div>
        <button type="button" onClick={handleLoadBanks} disabled={banksLoading}>
          {banksLoading ? 'Loading…' : 'Load banks'}
        </button>
      </div>

      {banksError ? (
        <p className="error" role="alert">
          {banksError}
        </p>
      ) : null}

      <form className="form-grid" onSubmit={handleCreate}>
        <label>
          Legal ID type
          <select name="legalIdType" defaultValue="CC" required>
            {LEGAL_ID_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Legal ID
          <input name="legalId" required />
        </label>
        <label>
          Destination bank
          <select name="bankId" required disabled={banks.length === 0}>
            <option value="">Select a bank</option>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name || bank.id}
                {bank.code ? ` (${bank.code})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Account type
          <select name="accountType" defaultValue="AHORROS" required>
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Account number
          <input
            name="accountNumber"
            inputMode="numeric"
            pattern="[0-9]{6,20}"
            required
          />
        </label>
        <label>
          Beneficiary name
          <input name="name" autoComplete="name" required />
        </label>
        <label>
          Beneficiary email <span className="optional">optional</span>
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label>
          Amount (COP cents)
          <input name="amount" type="number" min="1" step="1" required />
        </label>
        <AccountSelect accounts={accounts} />
        <label>
          Reference
          <input name="reference" placeholder="bank-demo-001" required />
        </label>
        {accounts.length === 0 || banks.length === 0 ? (
          <p className="hint full-width">
            Load at least one origin account and the bank catalogue first.
          </p>
        ) : null}
        <div className="form-actions full-width">
          <button
            type="submit"
            disabled={creating || accounts.length === 0 || banks.length === 0}
          >
            {creating ? 'Creating…' : 'Create bank dispersion'}
          </button>
        </div>
      </form>

      {createError ? (
        <p className="error" role="alert">
          {createError}
        </p>
      ) : null}

      {payoutId ? (
        <PayoutResult
          payoutId={payoutId}
          status={status}
          error={statusError}
          refreshing={refreshing}
          onRefresh={handleRefreshStatus}
        />
      ) : null}
    </section>
  )
}
