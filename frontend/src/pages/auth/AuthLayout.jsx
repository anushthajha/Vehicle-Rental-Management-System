import React from 'react'
import { Car, ShieldCheck } from 'lucide-react'

export default function AuthLayout({ children, compact = false }) {
  if (compact) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-50 px-4 py-10">
        {children}
      </main>
    )
  }

  return (
    <main className="grid min-h-screen bg-zinc-50 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-zinc-950 lg:block">
        <img
          className="absolute inset-0 h-full w-full object-cover opacity-75"
          src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1400&q=80"
          alt="A car on an open road"
        />
        <div className="absolute inset-0 bg-zinc-950/45" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3 text-xl font-black">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-zoomcar">
              <Car size={24} />
            </span>
            Zoomcar
          </div>
          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold backdrop-blur">
              <ShieldCheck size={18} />
              Verified trips, secure accounts
            </div>
            <h1 className="text-5xl font-black leading-tight">Drive yourself anywhere, with your account protected.</h1>
            <p className="mt-5 max-w-lg text-lg leading-8 text-zinc-100">
              Email verification, strong passwords, and secure sessions keep bookings smooth from signup to pickup.
            </p>
          </div>
        </div>
      </section>
      <section className="grid place-items-center px-4 py-10 sm:px-8">{children}</section>
    </main>
  )
}
