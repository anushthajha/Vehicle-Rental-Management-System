import React, { lazy, Suspense } from 'react'

function lazyWithDelay(importFn, delayMs = 500) {
  return lazy(() =>
    Promise.all([
      importFn(),
      new Promise((resolve) => setTimeout(resolve, delayMs)),
    ]).then(([module]) => module)
  )
}

import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminRoute, CustomerRoute, LoggedOutRoute, PrivateRoute, VehicleManagerRoute } from './components/RouteGuards'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import ChatbotWidget from './components/chatbot/ChatbotWidget'
import HelpAssistantWidget from './components/help/HelpAssistantWidget'

const HomePage = lazyWithDelay(() => import('./pages/HomePage'))
const VehicleListingPage = lazyWithDelay(() => import('./pages/VehicleListingPage'))
const VehicleDetailPage = lazyWithDelay(() => import('./pages/VehicleDetailPage'))
const CityPage = lazyWithDelay(() => import('./pages/CityPage'))
const WishlistPage = lazyWithDelay(() => import('./pages/WishlistPage'))
const LoginPage = lazyWithDelay(() => import('./pages/auth/LoginPage'))
const RegisterPage = lazyWithDelay(() => import('./pages/auth/RegisterPage'))
const VerifyOtpPage = lazyWithDelay(() => import('./pages/auth/VerifyOtpPage'))
const ForgotPasswordPage = lazyWithDelay(() => import('./pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazyWithDelay(() => import('./pages/auth/ResetPasswordPage'))
const DashboardPage = lazyWithDelay(() => import('./pages/user/DashboardPage'))
const RentalHistoryPage = lazyWithDelay(() => import('./pages/user/RentalHistoryPage'))
const TrackRentalPage = lazyWithDelay(() => import('./pages/user/TrackRentalPage'))
const ProfilePage = lazyWithDelay(() => import('./pages/user/ProfilePage'))
const KYCPage = lazyWithDelay(() => import('./pages/user/KYCPage'))
const MyBookingsPage = lazyWithDelay(() => import('./pages/booking/MyBookingsPage'))
const BookingDetailsPage = lazyWithDelay(() => import('./pages/booking/BookingDetailsPage'))
const WalletPage = lazyWithDelay(() => import('./pages/user/WalletPage'))
const NotificationsPage = lazyWithDelay(() => import('./pages/user/NotificationsPage'))
const ReviewsPage = lazyWithDelay(() => import('./pages/user/ReviewsPage'))
const SupportPage = lazyWithDelay(() => import('./pages/user/SupportPage'))
const ManagerLayout = lazyWithDelay(() => import('./pages/manager/ManagerLayout'))
const ManagerDashboardPage = lazyWithDelay(() => import('./pages/manager/ManagerDashboardPage'))
const ManagerVehiclesPage = lazyWithDelay(() => import('./pages/manager/ManagerVehiclesPage'))
const AddVehiclePage = lazyWithDelay(() => import('./pages/manager/AddVehiclePage'))
const EditVehiclePage = lazyWithDelay(() => import('./pages/manager/EditVehiclePage'))
const ManagerBookingsPage = lazyWithDelay(() => import('./pages/manager/ManagerBookingsPage'))
const InspectionPage = lazyWithDelay(() => import('./pages/manager/InspectionPage'))
const ActiveTripsPage = lazyWithDelay(() => import('./pages/manager/ActiveTripsPage'))
const ManagerEarningsPage = lazyWithDelay(() => import('./pages/manager/ManagerEarningsPage'))
const ManagerProfilePage = lazyWithDelay(() => import('./pages/manager/ManagerProfilePage'))
const PayoutsPage = lazyWithDelay(() => import('./pages/manager/PayoutsPage'))
const ManagerAvailabilityPage = lazyWithDelay(() => import('./pages/manager/ManagerAvailabilityPage'))
const ManagerStatisticsPage = lazyWithDelay(() => import('./pages/manager/ManagerStatisticsPage'))
const BookingConfirmPage = lazyWithDelay(() => import('./pages/booking/BookingConfirmPage'))
const PaymentPage = lazyWithDelay(() => import('./pages/booking/PaymentPage'))
const BookingSuccessPage = lazyWithDelay(() => import('./pages/booking/BookingSuccessPage'))
const WriteReviewPage = lazyWithDelay(() => import('./pages/booking/WriteReviewPage'))
const AdminLayout = lazyWithDelay(() => import('./pages/admin/AdminLayout'))
const AdminDashboardPage = lazyWithDelay(() => import('./pages/admin/AdminDashboardPage'))
const AdminUsersPage = lazyWithDelay(() => import('./pages/admin/AdminUsersPage'))
const AdminVehicleManagersPage = lazyWithDelay(() => import('./pages/admin/AdminVehicleManagersPage'))
const CreateManagerPage = lazyWithDelay(() => import('./pages/admin/CreateManagerPage'))
const AdminVehiclesPage = lazyWithDelay(() => import('./pages/admin/AdminVehiclesPage'))
const AdminManageVehiclesPage = lazyWithDelay(() => import('./pages/admin/AdminManageVehiclesPage'))
const AdminCategoriesPage = lazyWithDelay(() => import('./pages/admin/AdminCategoriesPage'))
const AdminKYCPage = lazyWithDelay(() => import('./pages/admin/AdminKYCPage'))
const AdminSupportPage = lazyWithDelay(() => import('./pages/admin/AdminSupportPage'))
const AdminCouponsPage = lazyWithDelay(() => import('./pages/admin/AdminCouponsPage'))
const AdminBookingsPage = lazyWithDelay(() =>
  import('./pages/admin/AdminDataPages').then((m) => ({ default: m.AdminBookingsPage }))
)
const AdminPaymentsPage = lazyWithDelay(() =>
  import('./pages/admin/AdminDataPages').then((m) => ({ default: m.AdminPaymentsPage }))
)
const AdminPayoutsPage = lazyWithDelay(() =>
  import('./pages/admin/AdminDataPages').then((m) => ({ default: m.AdminPayoutsPage }))
)
const AdminSettingsPage = lazyWithDelay(() =>
  import('./pages/admin/AdminDataPages').then((m) => ({ default: m.AdminSettingsPage }))
)
const HowItWorksPage = lazyWithDelay(() => import('./pages/HowItWorksPage'))
const SafetyPage = lazyWithDelay(() => import('./pages/SafetyPage'))
const InsurancePage = lazyWithDelay(() => import('./pages/InsurancePage'))
const AboutPage = lazyWithDelay(() => import('./pages/AboutPage'))
const ContactPage = lazyWithDelay(() => import('./pages/ContactPage'))
const TermsPage = lazyWithDelay(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.TermsPage }))
)
const PrivacyPage = lazyWithDelay(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.PrivacyPage }))
)
const RefundPage = lazyWithDelay(() =>
  import('./pages/LegalPages').then((m) => ({ default: m.RefundPage }))
)
const NotFoundPage = lazyWithDelay(() => import('./pages/NotFoundPage'))
const UnauthorizedPage = lazyWithDelay(() => import('./pages/UnauthorizedPage'))

function PageLoader() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#F9FAFB]">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-[#E31837]" />
        <p className="mt-4 text-sm font-black text-zinc-400 animate-pulse">Loading...</p>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <a href="#main-content" className="skip-link">Skip to main content</a>
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 4000,
              success: {
                style: { background: '#10B981', color: '#fff' },
                iconTheme: { primary: '#fff', secondary: '#10B981' },
              },
              error: {
                duration: 5000,
                style: { background: '#EF4444', color: '#fff' },
                iconTheme: { primary: '#fff', secondary: '#EF4444' },
              },
            }}
          />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/vehicles" element={<VehicleListingPage />} />
              <Route path="/vehicles/:carId" element={<VehicleDetailPage />} />
              <Route path="/categories/:categorySlug" element={<VehicleListingPage />} />
              <Route path="/vehicle-types/:typeSlug" element={<VehicleListingPage />} />
              <Route path="/cities/:city" element={<CityPage />} />
              <Route path="/wishlist" element={<WishlistPage />} />

              {/* Auth routes — redirect logged-in users away */}
              <Route element={<LoggedOutRoute />}>
                <Route path="/auth/login" element={<LoginPage />} />
                <Route path="/auth/register" element={<RegisterPage />} />
                <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
              </Route>

              {/* OTP verification — public, not behind LoggedOutRoute so unverified users can access */}
              <Route path="/auth/verify-otp" element={<VerifyOtpPage />} />

              {/* Generic authenticated routes (any role) */}
              <Route element={<PrivateRoute />}>
                <Route path="/dashboard/profile" element={<ProfilePage />} />
                <Route path="/dashboard/kyc" element={<KYCPage />} />
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

              {/* Customer routes */}
              <Route element={<CustomerRoute />}>
                <Route path="/customer/dashboard" element={<DashboardPage />} />
                <Route path="/customer/bookings" element={<MyBookingsPage />} />
                <Route path="/customer/bookings/history" element={<RentalHistoryPage />} />
                <Route path="/customer/bookings/:bookingId" element={<BookingDetailsPage />} />
                <Route path="/customer/track/:bookingId" element={<TrackRentalPage />} />
                <Route path="/customer/wallet" element={<WalletPage />} />
                <Route path="/customer/kyc" element={<KYCPage />} />
                <Route path="/customer/profile" element={<ProfilePage />} />
                <Route path="/customer/notifications" element={<NotificationsPage />} />
                <Route path="/customer/support" element={<SupportPage />} />
                <Route path="/customer/wishlist" element={<WishlistPage />} />
              </Route>

              {/* Legacy dashboard redirects */}
              <Route path="/dashboard" element={<Navigate to="/customer/dashboard" replace />} />
              <Route path="/dashboard/bookings" element={<Navigate to="/customer/bookings" replace />} />

              {/* Vehicle Manager routes */}
              <Route element={<VehicleManagerRoute />}>
                <Route path="/manager" element={<ManagerLayout />}>
                  <Route index element={<Navigate to="/manager/dashboard" replace />} />
                  <Route path="dashboard" element={<ManagerDashboardPage />} />
                  <Route path="vehicles" element={<ManagerVehiclesPage />} />
                  <Route path="vehicles/add" element={<AddVehiclePage />} />
                  <Route path="vehicles/:carId" element={<EditVehiclePage />} />
                  <Route path="vehicles/:carId/edit" element={<EditVehiclePage />} />
                  <Route path="bookings" element={<ManagerBookingsPage />} />
                  <Route path="inspect/:bookingId" element={<InspectionPage />} />
                  <Route path="support" element={<AdminSupportPage />} />
                  <Route path="availability" element={<ManagerAvailabilityPage />} />
                  <Route path="statistics" element={<ManagerStatisticsPage />} />
                  <Route path="trips/active" element={<ActiveTripsPage />} />
                  <Route path="earnings" element={<ManagerEarningsPage />} />
                  <Route path="profile" element={<ManagerProfilePage />} />
                  <Route path="payouts" element={<PayoutsPage />} />
                  {/* Legacy redirects */}
                  <Route path="my-vehicles" element={<Navigate to="/manager/vehicles" replace />} />
                  <Route path="add-vehicle" element={<Navigate to="/manager/vehicles/add" replace />} />
                  <Route path="active-trips" element={<Navigate to="/manager/trips/active" replace />} />
                </Route>
              </Route>
              <Route path="/manager/*" element={<Navigate to="/manager/dashboard" replace />} />

              {/* Admin routes */}
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="dashboard" element={<AdminDashboardPage />} />
                  <Route path="users" element={<AdminUsersPage />} />
                  <Route path="users/managers" element={<AdminVehicleManagersPage />} />
                  <Route path="users/managers/create" element={<CreateManagerPage />} />
                  <Route path="vehicles" element={<AdminVehiclesPage />} />
                  <Route path="vehicles/manage" element={<AdminManageVehiclesPage />} />
                  <Route path="categories" element={<AdminCategoriesPage />} />
                  <Route path="kyc" element={<AdminKYCPage />} />
                  <Route path="bookings" element={<AdminBookingsPage />} />
                  <Route path="payments" element={<AdminPaymentsPage />} />
                  <Route path="support" element={<AdminSupportPage />} />
                  <Route path="coupons" element={<AdminCouponsPage />} />
                  <Route path="analytics" element={<Navigate to="/admin/dashboard" replace />} />
                  <Route path="payouts" element={<AdminPayoutsPage />} />
                  <Route path="settings" element={<AdminSettingsPage />} />
                </Route>
              </Route>

              {/* Static pages */}
              <Route path="/how-it-works" element={<HowItWorksPage />} />
              <Route path="/safety" element={<SafetyPage />} />
              <Route path="/insurance" element={<InsurancePage />} />
              <Route
                path="/become-a-manager"
                element={<Navigate to="/auth/register" replace state={{ intendedRole: 'vehicle_manager' }} />}
              />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/refund-policy" element={<RefundPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/unauthorized" element={<UnauthorizedPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          <HelpAssistantWidget />
          <CustomerChatbot />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

function CustomerChatbot() {
  const { user } = useAuth()
  if (!user || user.role !== 'customer') return null
  return <ChatbotWidget />
}
