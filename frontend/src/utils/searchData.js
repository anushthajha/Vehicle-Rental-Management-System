export const CITIES = [
  'Bengaluru',
  'Mumbai',
  'Delhi NCR',
  'Hyderabad',
  'Chennai',
  'Pune',
  'Kolkata',
  'Ahmedabad',
  'Jaipur',
  'Goa',
  'Kochi',
  'Chandigarh',
  'Lucknow',
  'Indore',
  'Bhopal',
  'Nagpur',
  'Surat',
  'Vadodara',
  'Coimbatore',
  'Mysuru',
  'Mangalore',
  'Visakhapatnam',
  'Vijayawada',
  'Bhubaneswar',
  'Patna',
  'Ranchi',
  'Guwahati',
  'Dehradun',
  'Shimla',
  'Agra',
  'Varanasi',
  'Udaipur',
  'Jodhpur',
  'Nashik',
  'Aurangabad',
  'Thiruvananthapuram',
  'Madurai',
  'Tiruchirappalli',
  'Salem',
  'Noida',
  'Gurugram',
  'Faridabad',
  'Ghaziabad',
  'Amritsar',
  'Ludhiana',
  'Jalandhar',
  'Raipur',
  'Bilaspur',
  'Kanpur',
  'Meerut',
]

export const TOP_CITIES = CITIES.slice(0, 8)

export const CATEGORIES = [
  { key: 'hatchback', label: 'Hatchback', icon: '🚗' },
  { key: 'sedan', label: 'Sedan', icon: '🚙' },
  { key: 'suv', label: 'SUV', icon: '🚐' },
  { key: 'muv', label: 'MUV', icon: '🛻' },
  { key: 'luxury', label: 'Luxury', icon: '💎' },
  { key: 'electric', label: 'Electric', icon: '⚡' },
  { key: 'convertible', label: 'Convertible', icon: '🏎️' },
  { key: 'minivan', label: 'Minivan', icon: '🚌' },
]

export const FUEL_TYPES = ['petrol', 'diesel', 'electric', 'hybrid', 'cng']
export const SEAT_OPTIONS = [2, 4, 5, 6, 7, 8]

export const FEATURE_OPTIONS = [
  { key: 'ac', label: 'AC', icon: '❄️' },
  { key: 'sunroof', label: 'Sunroof', icon: '☀️' },
  { key: 'gps', label: 'GPS Tracker', icon: '📡' },
  { key: 'keyless', label: 'Keyless Entry', icon: '🔑' },
  { key: 'child_seat', label: 'Child Seat', icon: '🧒' },
  { key: 'music', label: 'Music System', icon: '🎵' },
]

export const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc', label: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'most_booked', label: 'Most Trips' },
  { value: 'newest', label: 'Newest' },
]

export const DEFAULT_FILTERS = {
  q: '',
  availability: true,
  price: [0, 10000],
  priceTouched: false,
  categories: [],
  vehicleTypes: [],
  brands: [],
  transmission: '',
  fuelTypes: [],
  seats: [],
  features: [],
  rating: '',
  distance: 25,
  sortBy: 'recommended',
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

export function formatDuration(start, end) {
  if (!start || !end) return 'Select dates'
  const minutes = Math.max(Math.round((new Date(end) - new Date(start)) / 60000), 0)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (!days && !hours) return 'Less than 1 Hour'
  return `${days ? `${days} Day${days > 1 ? 's' : ''}` : ''}${days && hours ? ' ' : ''}${hours ? `${hours} Hour${hours > 1 ? 's' : ''}` : ''}`
}

export function addHours(date, hours) {
  return new Date(new Date(date).getTime() + hours * 60 * 60 * 1000)
}

export function dateRangeLabel(start, end) {
  if (!start || !end) return ''
  const fmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' })
  return `${fmt.format(new Date(start))} - ${fmt.format(new Date(end))}`
}
