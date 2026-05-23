import React, { lazy, Suspense, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminRoute, GuestRoute, HostRoute, PrivateRoute } from './components/RouteGuards'
import { AuthProvider } from './context/AuthContext'

const HomePage = lazy(() => import('./pages/HomePage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const CarDetailPage = lazy(() => import('./pages/CarDetailPage'))
const CityPage = lazy(() => import('./pages/CityPage'))
const WishlistPage = lazy(() => import('./pages/WishlistPage'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'))
const EmailVerificationPage = lazy(() => import('./pages/auth/EmailVerificationPage'))
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'))
const DashboardPage = lazy(() => import('./pages/user/DashboardPage'))
const ProfilePage = lazy(() => import('./pages/user/ProfilePage'))
const KYCPage = lazy(() => import('./pages/user/KYCPage'))
const MyBookingsPage = lazy(() => import('./pages/booking/MyBookingsPage'))
const BookingDetailsPage = lazy(() => import('./pages/booking/BookingDetailsPage'))
const WalletPage = lazy(() => import('./pages/user/WalletPage'))
const NotificationsPage = lazy(() => import('./pages/user/NotificationsPage'))
const ReviewsPage = lazy(() => import('./pages/user/ReviewsPage'))
const SupportPage = lazy(() => import('./pages/user/SupportPage'))
const HostLayout = lazy(() => import('./pages/host/HostLayout'))
const HostDashboardPage = lazy(() => import('./pages/host/HostDashboardPage'))
const ManageCarsPage = lazy(() => import('./pages/host/ManageCarsPage'))
const ListCarPage = lazy(() => import('./pages/host/ListCarPage'))
const EditCarPage = lazy(() => import('./pages/host/EditCarPage'))
const BookingRequestsPage = lazy(() => import('./pages/host/BookingRequestsPage'))
const ActiveTripsPage = lazy(() => import('./pages/host/ActiveTripsPage'))
const HostEarningsPage = lazy(() => import('./pages/host/HostEarningsPage'))
const HostProfilePage = lazy(() => import('./pages/host/HostProfilePage'))
const PayoutsPage = lazy(() => import('./pages/host/PayoutsPage'))
const BookingConfirmPage = lazy(() => import('./pages/booking/BookingConfirmPage'))
const PaymentPage = lazy(() => import('./pages/booking/PaymentPage'))
const BookingSuccessPage = lazy(() => import('./pages/booking/BookingSuccessPage'))
const WriteReviewPage = lazy(() => import('./pages/booking/WriteReviewPage'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'))
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'))
const AdminCarsPage = lazy(() => import('./pages/admin/AdminCarsPage'))
const AdminKYCPage = lazy(() => import('./pages/admin/AdminKYCPage'))
const AdminSupportPage = lazy(() => import('./pages/admin/AdminSupportPage'))
const AdminCouponsPage = lazy(() => import('./pages/admin/AdminCouponsPage'))
const AdminAnalyticsPage = lazy(() => import('./pages/admin/AdminAnalyticsPage'))
const AdminBookingsPage = lazy(() => import('./pages/admin/AdminDataPages').then((module) => ({ default: module.AdminBookingsPage })))
const AdminPaymentsPage = lazy(() => import('./pages/admin/AdminDataPages').then((module) => ({ default: module.AdminPaymentsPage })))
const AdminPayoutsPage = lazy(() => import('./pages/admin/AdminDataPages').then((module) => ({ default: module.AdminPayoutsPage })))
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage'))
const SafetyPage = lazy(() => import('./pages/SafetyPage'))
const InsurancePage = lazy(() => import('./pages/InsurancePage'))
const BecomeHostPage = lazy(() => import('./pages/BecomeHostPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const TermsPage = lazy(() => import('./pages/LegalPages').then((module) => ({ default: module.TermsPage })))
const PrivacyPage = lazy(() => import('./pages/LegalPages').then((module) => ({ default: module.PrivacyPage })))
const RefundPage = lazy(() => import('./pages/LegalPages').then((module) => ({ default: module.RefundPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function PageLoader() {
  return <main className="grid min-h-screen place-items-center bg-[#F9FAFB] dark:bg-gray-900"><div className="h-11 w-11 animate-spin rounded-full border-4 border-zinc-200 border-t-[#E31837]" /></main>
}

export default function App() {
  useEffect(() => {
    const stored = localStorage.getItem('zoomcar-theme')
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', stored ? stored === 'dark' : prefersDark)
  }, [])

  return (
    <BrowserRouter>
      <AuthProvider>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <Toaster
          position="bottom-right"
          toastOptions={{
            success: { duration: 3000, style: { background: '#10B981', color: '#fff' } },
            error: { duration: 5000, style: { background: '#EF4444', color: '#fff' } },
          }}
        />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/cars/:carId" element={<CarDetailPage />} />
            <Route path="/cities/:city" element={<CityPage />} />
            <Route path="/wishlist" element={<WishlistPage />} />
            <Route element={<GuestRoute />}>
              <Route path="/auth/login" element={<LoginPage />} />
              <Route path="/auth/register" element={<RegisterPage />} />
              <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            </Route>
            <Route path="/auth/verify-email" element={<EmailVerificationPage />} />
            <Route element={<PrivateRoute />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/dashboard/profile" element={<ProfilePage />} />
              <Route path="/dashboard/kyc" element={<KYCPage />} />
              <Route path="/dashboard/bookings" element={<MyBookingsPage />} />
              <Route path="/dashboard/bookings/:bookingId" element={<BookingDetailsPage />} />
              <Route path="/dashboard/wallet" element={<WalletPage />} />
              <Route path="/dashboard/notifications" element={<NotificationsPage />} />
              <Route path="/dashboard/reviews" element={<ReviewsPage />} />
              <Route path="/dashboard/wishlist" element={<WishlistPage />} />
              <Route path="/dashboard/support" element={<SupportPage />} />
              <Route path="/support" element={<SupportPage />} />
              <Route path="/booking/confirm/:carId" element={<BookingConfirmPage />} />
              <Route path="/booking/pay/:bookingId" element={<PaymentPage />} />
              <Route path="/booking/success" element={<BookingSuccessPage />} />
              <Route path="/booking/review/:bookingId" element={<WriteReviewPage />} />
            </Route>
            <Route element={<HostRoute />}>
              <Route path="/host" element={<HostLayout />}>
                <Route index element={<Navigate to="/host/dashboard" replace />} />
                <Route path="dashboard" element={<HostDashboardPage />} />
                <Route path="cars" element={<ManageCarsPage />} />
                <Route path="cars/new" element={<ListCarPage />} />
                <Route path="cars/:carId/edit" element={<EditCarPage />} />
                <Route path="bookings" element={<BookingRequestsPage />} />
                <Route path="trips/active" element={<ActiveTripsPage />} />
                <Route path="earnings" element={<HostEarningsPage />} />
                <Route path="profile" element={<HostProfilePage />} />
                <Route path="payouts" element={<PayoutsPage />} />
                <Route path="my-cars" element={<Navigate to="/host/cars" replace />} />
                <Route path="list-car" element={<Navigate to="/host/cars/new" replace />} />
                <Route path="active-trips" element={<Navigate to="/host/trips/active" replace />} />
              </Route>
            </Route>
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboardPage />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="cars" element={<AdminCarsPage />} />
                <Route path="kyc" element={<AdminKYCPage />} />
                <Route path="bookings" element={<AdminBookingsPage />} />
                <Route path="payments" element={<AdminPaymentsPage />} />
                <Route path="support" element={<AdminSupportPage />} />
                <Route path="coupons" element={<AdminCouponsPage />} />
                <Route path="analytics" element={<AdminAnalyticsPage />} />
                <Route path="payouts" element={<AdminPayoutsPage />} />
              </Route>
            </Route>
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/safety" element={<SafetyPage />} />
            <Route path="/insurance" element={<InsurancePage />} />
            <Route path="/become-a-host" element={<BecomeHostPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/refund-policy" element={<RefundPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
