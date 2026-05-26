import React, { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Menu, X } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../../components/layout/Sidebar'
import NotificationBell from '../../components/layout/NotificationBell'

export default function ManagerLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950 flex">
      {/* Premium Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-zinc-800/20 bg-zinc-950 lg:flex lg:flex-col">
        <Sidebar />
      </aside>

      {/* Main Content Area */}
      <section className="flex-1 min-w-0 lg:pl-64 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:px-8 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-50 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#E31837]">Manager Console</p>
              <h1 className="text-lg font-black text-zinc-900 leading-tight">Operations Panel</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
          </div>
        </header>

        {/* Page Content Slot */}
        <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
          <Outlet />
        </div>
      </section>

      {/* Mobile Drawer */}
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 bg-zinc-950 text-white lg:hidden shadow-2xl transition duration-300">
            <Dialog.Title className="sr-only">Manager Navigation Menu</Dialog.Title>
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-4 top-3 z-50 grid h-10 w-10 place-items-center rounded-full bg-zinc-900 text-zinc-400 hover:text-white"
              aria-label="Close navigation menu"
            >
              <X size={20} />
            </button>
            <Sidebar onCloseMobile={() => setMobileOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  )
}
