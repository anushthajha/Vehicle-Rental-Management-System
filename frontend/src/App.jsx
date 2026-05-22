import React from 'react'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuthStore } from './context/AuthContext'
import { AdminRoute, GuestRoute, HostRoute, PrivateRoute } from './components/RouteGuards'
import EmailVerificationPage from './pages/auth/EmailVerificationPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import SearchBar from './components/search/SearchBar'
import CarDetailPage from './pages/CarDetailPage'
import SearchPage from './pages/SearchPage'
import WishlistPage from './pages/WishlistPage'
import BookingConfirmPage from './pages/booking/BookingConfirmPage'
import BookingDetailsPage from './pages/booking/BookingDetailsPage'
import BookingSuccessPage from './pages/booking/BookingSuccessPage'
import MyBookingsPage from './pages/booking/MyBookingsPage'
import PaymentPage from './pages/booking/PaymentPage'
import WriteReviewPage from './pages/booking/WriteReviewPage'
import ActiveTripsPage from './pages/host/ActiveTripsPage'
import BookingRequestsPage from './pages/host/BookingRequestsPage'
import EditCarPage from './pages/host/EditCarPage'
import ListCarPage from './pages/host/ListCarPage'
import ManageCarsPage from './pages/host/ManageCarsPage'
import DashboardPage from './pages/user/DashboardPage'
import KYCPage from './pages/user/KYCPage'
import NotificationsPage from './pages/user/NotificationsPage'
import ProfilePage from './pages/user/ProfilePage'
import ReviewsPage from './pages/user/ReviewsPage'
import SupportPage from './pages/user/SupportPage'
import WalletPage from './pages/user/WalletPage'

function HomePage() {
  const { user, logout } = useAuthStore()
  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase text-zoomcar">Zoomcar Clone</p>
            <h1 className="mt-2 text-4xl font-black text-zinc-950">Find your next self-drive car.</h1>
          </div>
          <div className="flex gap-3">
            {user ? (
              <>
                <Link className="rounded-md border border-zinc-300 px-4 py-3 font-bold text-zinc-900" to="/wishlist">Wishlist</Link>
                <Link className="rounded-md bg-zoomcar px-4 py-3 font-bold text-white" to="/host/my-cars">My Cars</Link>
                <button onClick={logout} className="rounded-md bg-zinc-950 px-4 py-3 font-bold text-white">Log out</button>
              </>
            ) : (
              <>
                <Link className="rounded-md border border-zinc-300 px-4 py-3 font-bold text-zinc-900" to="/auth/login">Log in</Link>
                <Link className="rounded-md bg-zoomcar px-4 py-3 font-bold text-white" to="/auth/register">Register</Link>
              </>
            )}
          </div>
        </div>
        <SearchBar className="mt-8" />
        {user && (
          <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-zinc-950">Signed in as {user.full_name}</h2>
            <p className="mt-2 text-zinc-600">{user.email}</p>
          </div>
        )}
      </section>
    </main>
  )
}

function Placeholder({ title }) {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black text-zinc-950">{title}</h1>
        <Link className="mt-5 inline-flex rounded-md bg-zoomcar px-4 py-3 font-bold text-white" to="/">Back home</Link>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/cars/:carId" element={<CarDetailPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route element={<GuestRoute />}>
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/register" element={<RegisterPage />} />
            <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            <Route path="/auth/verify-email" element={<EmailVerificationPage />} />
          </Route>
          <Route element={<PrivateRoute />}>
            <Route path="/account" element={<Placeholder title="Account" />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/dashboard/kyc" element={<KYCPage />} />
            <Route path="/dashboard/wallet" element={<WalletPage />} />
            <Route path="/dashboard/notifications" element={<NotificationsPage />} />
            <Route path="/dashboard/profile" element={<ProfilePage />} />
            <Route path="/dashboard/reviews" element={<ReviewsPage />} />
            <Route path="/dashboard/support" element={<SupportPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/booking/confirm/:carId" element={<BookingConfirmPage />} />
            <Route path="/booking/pay/:bookingId" element={<PaymentPage />} />
            <Route path="/booking/success" element={<BookingSuccessPage />} />
            <Route path="/booking/review/:bookingId" element={<WriteReviewPage />} />
            <Route path="/dashboard/bookings" element={<MyBookingsPage />} />
            <Route path="/dashboard/bookings/:bookingId" element={<BookingDetailsPage />} />
          </Route>
          <Route element={<HostRoute />}>
            <Route path="/host/dashboard" element={<ManageCarsPage />} />
            <Route path="/host/bookings" element={<BookingRequestsPage />} />
            <Route path="/host/active-trips" element={<ActiveTripsPage />} />
            <Route path="/host/list-car" element={<ListCarPage />} />
            <Route path="/host/my-cars" element={<ManageCarsPage />} />
            <Route path="/host/cars/:carId/edit" element={<EditCarPage />} />
          </Route>
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<Placeholder title="Admin dashboard" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
