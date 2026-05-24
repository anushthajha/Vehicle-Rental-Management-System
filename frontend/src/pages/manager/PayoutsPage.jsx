import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'
import { dateLabel, getManager, money, postManager } from './managerApi'

export default function PayoutsPage() {
  const [summary, setSummary] = useState(null)
  const [history, setHistory] = useState({ items: [], bank_account: {} })
  const [amount, setAmount] = useState('')
  const [bankOpen, setBankOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const load = () => Promise.all([getManager('/earnings/summary'), getManager('/payouts')]).then(([s, h]) => { setSummary(s); setHistory(h) })
  useEffect(load, [])

  const request = async () => {
    const response = await postManager('/payouts/request', { amount: Number(amount) })
    toast.success(response.message)
    setConfirm(false)
    setAmount('')
    load()
  }

  if (!summary) return <div className="grid min-h-screen place-items-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-sigfleet" /></div>
  const bank = history.bank_account || {}
  const disabled = !bank.has_bank_account || Number(amount) < 500 || Number(amount) > Number(summary.wallet_balance)

  return <div className="px-4 py-8"><section className="mx-auto max-w-6xl space-y-6"><div><p className="text-sm font-black uppercase text-sigfleet">Manager Payouts</p><h1 className="text-3xl font-black">Withdraw earnings</h1></div>
    <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><p className="text-sm font-bold text-zinc-500">Wallet Balance</p><p className="mt-2 text-4xl font-black">{money(summary.wallet_balance)}</p></div><div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><p className="text-sm font-bold text-zinc-500">Bank Account</p><p className="mt-2 text-xl font-black">{bank.has_bank_account ? bank.label : 'No bank account added'}</p><button onClick={() => setBankOpen(true)} className="mt-4 rounded-md border border-zinc-300 px-4 py-2 font-black">{bank.has_bank_account ? 'Edit Bank Account' : 'Add Bank Account'}</button></div></section>
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"><h2 className="font-black">Request Payout</h2><div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"><input type="number" min="500" className="input" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount, min ₹500" /><button disabled={disabled} onClick={() => setConfirm(true)} className="rounded-md bg-sigfleet px-5 py-3 font-black text-white disabled:opacity-50">Request Payout</button></div><p className="mt-2 text-sm font-bold text-zinc-500">{bank.has_bank_account ? `Available balance ${money(summary.wallet_balance)}` : 'Add bank account first'}</p></section>
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"><h2 className="p-5 font-black">Payout History</h2><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-zinc-50 text-xs uppercase text-zinc-500"><tr><th className="p-4">Date</th><th className="p-4">Amount</th><th className="p-4">Bank Account</th><th className="p-4">Status</th><th className="p-4">Processed Date</th></tr></thead><tbody>{history.items.map((item) => <tr key={item.id} className="border-t border-zinc-100"><td className="p-4">{dateLabel(item.requested_at)}</td><td className="p-4 font-black">{money(item.amount)}</td><td className="p-4">{item.bank_account || '-'}</td><td className="p-4"><Badge value={item.status} /></td><td className="p-4">{dateLabel(item.processed_at)}</td></tr>)}</tbody></table></section>
    {bankOpen && <BankPanel onClose={() => setBankOpen(false)} onDone={load} />}
    {confirm && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="w-full max-w-sm rounded-lg bg-white p-5"><h3 className="text-lg font-black">Request payout of {money(amount)}?</h3><p className="mt-2 text-sm font-bold text-zinc-500">This amount will be held from your wallet immediately.</p><div className="mt-5 flex justify-end gap-2"><button onClick={() => setConfirm(false)} className="rounded-md border border-zinc-200 px-4 py-2 font-black">Cancel</button><button onClick={request} className="rounded-md bg-sigfleet px-4 py-2 font-black text-white">Confirm</button></div></div></div>}
  </section></div>
}

function Badge({ value }) {
  const styles = { pending: 'bg-amber-50 text-amber-700', processing: 'bg-blue-50 text-blue-700', paid: 'bg-emerald-50 text-emerald-700', failed: 'bg-red-50 text-red-700' }
  return <span className={`rounded-full px-2 py-1 text-xs font-black capitalize ${styles[value] || 'bg-zinc-100 text-zinc-700'}`}>{value}</span>
}

function BankPanel({ onClose, onDone }) {
  const [form, setForm] = useState({ bank_name: '', account_number: '', ifsc: '', account_holder: '' })
  const save = async () => {
    await postManager('/profile/bank-details', form)
    toast.success('Bank account saved')
    onDone()
    onClose()
  }
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  return <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-zinc-200 bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h3 className="text-xl font-black">Bank Account</h3><button onClick={onClose} className="rounded-md p-2 hover:bg-zinc-100"><X size={20} /></button></div><div className="mt-5 space-y-4"><label className="label block">Bank name<input className="input mt-1" value={form.bank_name} onChange={(event) => set('bank_name', event.target.value)} /></label><label className="label block">Account holder<input className="input mt-1" value={form.account_holder} onChange={(event) => set('account_holder', event.target.value)} /></label><label className="label block">Account number<input className="input mt-1" value={form.account_number} onChange={(event) => set('account_number', event.target.value)} /></label><label className="label block">IFSC<input className="input mt-1 uppercase" maxLength={11} value={form.ifsc} onChange={(event) => set('ifsc', event.target.value.toUpperCase())} /></label><button onClick={save} className="w-full rounded-md bg-sigfleet px-4 py-3 font-black text-white">Save Bank Account</button></div></aside>
}
