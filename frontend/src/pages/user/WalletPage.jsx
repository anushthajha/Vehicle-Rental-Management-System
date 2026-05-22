import React, { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Download, Loader2, Plus, Wallet, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { moneyLabel } from '../../utils/bookingUtils'
import DashboardShell from './DashboardShell'

const TABS = ['all', 'credit', 'debit']
const PRESETS = [500, 1000, 2000, 5000]

export default function WalletPage() {
  const [wallet, setWallet] = useState({ balance: 0, transactions: [] })
  const [tab, setTab] = useState('all')
  const [dateRange, setDateRange] = useState({ start: '', end: '' })
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => { loadWallet() }, [tab])

  async function loadWallet() {
    setLoading(true)
    const response = await api.get('/payments/wallet', { params: { transaction_type: tab, limit: 20 } })
    setWallet(response.data)
    setLoading(false)
  }

  const visible = useMemo(() => wallet.transactions.filter((txn) => {
    const date = txn.created_at?.slice(0, 10)
    return (!dateRange.start || date >= dateRange.start) && (!dateRange.end || date <= dateRange.end)
  }), [wallet.transactions, dateRange])

  function downloadCsv() {
    const rows = [['Date', 'Description', 'Type', 'Amount', 'Balance After'], ...visible.map((txn) => [txn.created_at, txn.description, txn.transaction_type, txn.amount, txn.balance_after])]
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'wallet-transactions.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <DashboardShell title="Wallet" eyebrow="Payments" actions={<button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-zoomcar px-4 py-3 font-black text-white"><Plus size={18} /> Add Money</button>}>
      <section className="rounded-lg bg-zinc-950 p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-black text-zinc-300">Available Balance</p>
            <p className="mt-3 text-4xl font-black">{moneyLabel(wallet.balance || 0)}</p>
          </div>
          <div className="grid h-16 w-16 place-items-center rounded-md bg-white/10"><Wallet size={32} /></div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-md border border-zinc-200 bg-zinc-50 p-1">{TABS.map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded px-4 py-2 text-sm font-black capitalize ${tab === item ? 'bg-zoomcar text-white' : 'text-zinc-600'}`}>{item === 'all' ? 'All' : `${item}s`}</button>)}</div>
          <div className="flex flex-wrap gap-2">
            <input type="date" className="input h-10 w-40" value={dateRange.start} onChange={(event) => setDateRange((current) => ({ ...current, start: event.target.value }))} />
            <input type="date" className="input h-10 w-40" value={dateRange.end} onChange={(event) => setDateRange((current) => ({ ...current, end: event.target.value }))} />
            <button onClick={downloadCsv} className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 font-black"><Download size={17} /> CSV</button>
          </div>
        </div>

        {loading ? <div className="grid h-64 place-items-center"><Loader2 className="animate-spin text-zoomcar" /></div> : (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500"><tr><th className="py-3">Date</th><th>Description</th><th>Type</th><th className="text-right">Amount</th><th className="text-right">Balance After</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {visible.map((txn) => <tr key={txn.id}><td className="py-4 font-bold">{formatDate(txn.created_at)}</td><td className="pr-6 font-bold text-zinc-700">{txn.description}</td><td className="capitalize text-zinc-500">{txn.transaction_type}</td><td className={`text-right font-black ${txn.transaction_type === 'credit' ? 'text-emerald-700' : 'text-red-700'}`}>{txn.transaction_type === 'credit' ? '+' : '-'}{moneyLabel(txn.amount)}</td><td className="text-right font-bold">{moneyLabel(txn.balance_after)}</td></tr>)}
              </tbody>
            </table>
            {!visible.length && <div className="grid min-h-52 place-items-center text-center font-black text-zinc-500">No transactions found</div>}
          </div>
        )}
      </section>

      <AddMoneyModal open={modalOpen} onOpenChange={setModalOpen} onAdded={loadWallet} />
    </DashboardShell>
  )
}

function AddMoneyModal({ open, onOpenChange, onAdded }) {
  const [amount, setAmount] = useState(1000)
  const [confirming, setConfirming] = useState(false)
  const [processing, setProcessing] = useState(false)

  async function confirmPayment() {
    setProcessing(true)
    try {
      await api.post('/payments/wallet/add', { amount: Number(amount) })
      toast.success('Money added to wallet')
      setConfirming(false)
      onOpenChange(false)
      onAdded()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Payment failed')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl">
          <div className="flex items-center justify-between"><Dialog.Title className="text-xl font-black">Add Money</Dialog.Title><Dialog.Close><X className="text-zinc-500" /></Dialog.Close></div>
          {!confirming ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{PRESETS.map((preset) => <button key={preset} onClick={() => setAmount(preset)} className={`rounded-md border px-4 py-3 font-black ${Number(amount) === preset ? 'border-zoomcar bg-red-50 text-zoomcar' : 'border-zinc-200'}`}>₹{preset}</button>)}</div>
              <input className="input mt-4 h-11" type="number" min="100" max="10000" value={amount} onChange={(event) => setAmount(event.target.value)} />
              <button onClick={() => setConfirming(true)} className="mt-5 w-full rounded-md bg-zoomcar px-4 py-3 font-black text-white">Add {moneyLabel(amount)} to Wallet</button>
            </>
          ) : (
            <div className="mt-5 rounded-lg border border-zinc-200 p-4">
              <p className="font-black">Simulated Payment</p>
              <p className="mt-2 text-sm font-bold text-zinc-500">Confirm this test payment to credit your wallet instantly.</p>
              <button onClick={confirmPayment} disabled={processing} className="mt-5 inline-flex w-full justify-center rounded-md bg-zinc-950 px-4 py-3 font-black text-white disabled:opacity-60">{processing ? <Loader2 className="animate-spin" /> : `Confirm ${moneyLabel(amount)}`}</button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '-'
}
