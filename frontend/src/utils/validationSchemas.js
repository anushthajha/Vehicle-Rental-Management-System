import { z } from 'zod'

const passwordRule = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/\d/, 'Password must include a number')
  .regex(/[!@#$%^&*]/, 'Password must include a special character (!@#$%^&*)')

export const registerSchema = z.object({
  full_name: z.string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name is too long')
    .regex(/^[A-Za-z ]+$/, 'Name can only contain letters and spaces'),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string()
    .transform((value) => value.replace(/^\+91/, '').replace(/\D/g, ''))
    .pipe(z.string().length(10, 'Phone must be exactly 10 digits').regex(/^[6-9]\d{9}$/, 'Phone must be a valid Indian mobile number')),
  password: passwordRule,
  confirm_password: z.string(),
  role: z.enum(['customer', 'vehicle_manager']).default('customer'),
  terms: z.literal(true, { errorMap: () => ({ message: 'Please accept the terms' }) }),
}).refine((data) => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

export const carListingStepSchemas = [
  z.object({
    make: z.string().trim().min(1, 'Make is required'),
    car_model: z.string().trim().min(1, 'Model is required'),
    year: z.coerce.number().int().min(2010, 'Year must be 2010 or newer').max(2024, 'Year cannot be after 2024'),
    registration_number: z.string().trim().regex(/^[A-Z0-9-]{8,15}$/, 'Use 8-15 uppercase letters/numbers'),
  }),
  z.object({
    description: z.string().trim().min(50, 'Description must be at least 50 characters'),
    features: z.array(z.string()).min(1, 'Choose at least one feature'),
  }).passthrough(),
  z.object({
    location_city: z.string().trim().min(1, 'City is required'),
    location_lat: z.coerce.number({ invalid_type_error: 'Pick a location on the map' }),
    location_lng: z.coerce.number({ invalid_type_error: 'Pick a location on the map' }),
  }),
  z.object({
    price_per_hour: z.coerce.number().min(20, 'Hourly price must be at least ₹20'),
    price_per_day: z.coerce.number().min(100, 'Daily price must be at least ₹100'),
    min_trip_hours: z.coerce.number().refine((value) => [4, 6, 8, 12, 24].includes(value), 'Choose a valid minimum trip duration'),
  }),
  z.object({
    images: z.array(z.any()).min(3, 'Upload at least 3 images'),
  }),
  z.object({}).passthrough(),
]

export const bookingSchema = z.object({
  insurance_plan: z.enum(['basic', 'standard', 'platinum'], { required_error: 'Choose an insurance plan' }),
  pickup_datetime: z.coerce.date(),
  return_datetime: z.coerce.date(),
}).refine((data) => data.return_datetime > data.pickup_datetime, {
  message: 'Return time must be after pickup time',
  path: ['return_datetime'],
})

export const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Choose a rating').max(5, 'Rating cannot exceed 5'),
  body: z.string().optional().refine((value) => !value || value.trim().length >= 30, 'Review must be at least 30 characters'),
})

export const kycSchema = z.object({
  dl_number: z.string().trim().min(8, 'Driving license must be at least 8 characters'),
  aadhar_number: z.string().transform((value) => value.replace(/\D/g, '')).pipe(z.string().length(12, 'Aadhaar must be exactly 12 digits')),
  dl_front_image: z.any().refine(Boolean, 'Driving license front is required'),
  dl_back_image: z.any().refine(Boolean, 'Driving license back is required'),
  aadhar_front_image: z.any().refine(Boolean, 'Aadhaar front is required'),
  aadhar_back_image: z.any().refine(Boolean, 'Aadhaar back is required'),
})

export const resetPasswordSchema = z.object({
  new_password: passwordRule,
  confirm_password: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.new_password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

export const profileUpdateSchema = z.object({
  full_name: z.string().trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name is too long')
    .regex(/^[A-Za-z ]+$/, 'Name can only contain letters and spaces'),
  phone: z.string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^([6-9]\d{9})?$/, 'Enter a valid 10-digit Indian mobile number')),
})

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: passwordRule,
  confirm_new_password: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.new_password === data.confirm_new_password, {
  message: 'Passwords do not match',
  path: ['confirm_new_password'],
})

export const chauffeurSchema = z.object({
  driver_name: z.string().trim().min(2, 'Driver name must be at least 2 characters').regex(/^[A-Za-z ]+$/, 'Name can only contain letters and spaces'),
  driver_license_number: z.string().trim().min(8, 'License number must be at least 8 characters').regex(/^[A-Z0-9-]+$/i, 'Enter a valid license number'),
  driver_phone: z.string().transform((v) => v.replace(/\D/g, '')).pipe(z.string().length(10, 'Phone must be exactly 10 digits').regex(/^[6-9]\d{9}$/, 'Enter a valid Indian mobile number')),
  driver_experience: z.coerce.number().min(1, 'Experience must be at least 1 year').max(50, 'Experience cannot exceed 50 years'),
})

export const bankDetailsSchema = z.object({
  bank_name: z.string().trim().min(1, 'Bank name is required'),
  account_number: z.string().trim().regex(/^\d{9,18}$/, 'Account number must be 9-18 digits'),
  ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC code'),
  account_holder: z.string().trim().min(3, 'Account holder name must be at least 3 characters'),
})

export const supportTicketSchema = z.object({
  subject: z.string().trim().min(5, 'Subject must be at least 5 characters'),
  description: z.string().trim().min(20, 'Description must be at least 20 characters'),
})

export function collectZodErrors(error) {
  return Object.fromEntries((error?.issues || []).map((issue) => [issue.path.join('.'), issue.message]))
}

export function collectApiFieldErrors(detail) {
  if (!Array.isArray(detail)) return {}
  return Object.fromEntries(detail.map((issue) => {
    const field = (issue.loc || []).filter((part) => part !== 'body').join('.')
    const message = String(issue.msg || 'Invalid value').replace(/^Value error,\s*/i, '')
    return [field, message]
  }).filter(([field]) => field))
}
