import React, { useEffect, useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Circle, MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import * as Slider from '@radix-ui/react-slider'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { z } from 'zod'
import {
  Armchair,
  Car,
  Check,
  ChevronDown,
  Gauge,
  IndianRupee,
  Loader2,
  MapPin,
  Music,
  Navigation,
  Shield,
  Snowflake,
  Star,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import api from '../../services/api'
import { useVehicleCategories } from '../../hooks/useVehicleCategories'

const BRANDS = [
  'Maruti Suzuki', 'Hyundai', 'Honda', 'Tata', 'Toyota', 'Mahindra', 'Kia', 'MG', 'Ford', 'Volkswagen',
  'Skoda', 'Renault', 'Nissan', 'Jeep', 'BMW', 'Mercedes-Benz', 'Audi', 'Volvo', 'Jaguar', 'Land Rover',
  'Lexus', 'Mini', 'Porsche', 'Mitsubishi', 'Chevrolet', 'Fiat', 'Datsun', 'Citroen', 'BYD', 'Isuzu',
  'Force Motors', 'Hindustan Motors', 'Opel', 'Peugeot', 'Daewoo', 'Premier', 'Aston Martin', 'Bentley',
  'Ferrari', 'Lamborghini', 'Maserati', 'Rolls-Royce', 'Tesla', 'SsangYong', 'Subaru', 'Suzuki', 'Mazda',
  'Chrysler', 'Dodge', 'GMC', 'Hummer', 'Infiniti', 'Lincoln', 'Acura', 'Genesis',
]
const MODEL_SUGGESTIONS = {
  'Maruti Suzuki': ['Swift', 'Baleno', 'Dzire', 'Brezza', 'Ertiga', 'Grand Vitara'],
  Hyundai: ['i20', 'Creta', 'Venue', 'Verna', 'Alcazar', 'Aura'],
  Honda: ['City', 'Amaze', 'Elevate', 'Jazz', 'WR-V'],
  Tata: ['Nexon', 'Punch', 'Altroz', 'Harrier', 'Safari', 'Tiago'],
  Toyota: ['Innova Crysta', 'Fortuner', 'Glanza', 'Urban Cruiser Hyryder', 'Camry'],
  Mahindra: ['Scorpio N', 'XUV700', 'Thar', 'Bolero', 'XUV300'],
  Kia: ['Seltos', 'Sonet', 'Carens', 'EV6'],
}
const CITIES = [
  ['Bengaluru', 'Karnataka', 12.9716, 77.5946], ['Mumbai', 'Maharashtra', 19.076, 72.8777], ['Delhi', 'Delhi', 28.6139, 77.209],
  ['Hyderabad', 'Telangana', 17.385, 78.4867], ['Chennai', 'Tamil Nadu', 13.0827, 80.2707], ['Pune', 'Maharashtra', 18.5204, 73.8567],
  ['Kolkata', 'West Bengal', 22.5726, 88.3639], ['Ahmedabad', 'Gujarat', 23.0225, 72.5714], ['Jaipur', 'Rajasthan', 26.9124, 75.7873],
  ['Kochi', 'Kerala', 9.9312, 76.2673], ['Goa', 'Goa', 15.2993, 74.124], ['Chandigarh', 'Chandigarh', 30.7333, 76.7794],
  ['Lucknow', 'Uttar Pradesh', 26.8467, 80.9462], ['Indore', 'Madhya Pradesh', 22.7196, 75.8577], ['Bhopal', 'Madhya Pradesh', 23.2599, 77.4126],
  ['Nagpur', 'Maharashtra', 21.1458, 79.0882], ['Surat', 'Gujarat', 21.1702, 72.8311], ['Vadodara', 'Gujarat', 22.3072, 73.1812],
  ['Coimbatore', 'Tamil Nadu', 11.0168, 76.9558], ['Mysuru', 'Karnataka', 12.2958, 76.6394], ['Mangaluru', 'Karnataka', 12.9141, 74.856],
  ['Visakhapatnam', 'Andhra Pradesh', 17.6868, 83.2185], ['Vijayawada', 'Andhra Pradesh', 16.5062, 80.648], ['Patna', 'Bihar', 25.5941, 85.1376],
  ['Ranchi', 'Jharkhand', 23.3441, 85.3096], ['Bhubaneswar', 'Odisha', 20.2961, 85.8245], ['Guwahati', 'Assam', 26.1445, 91.7362],
  ['Dehradun', 'Uttarakhand', 30.3165, 78.0322], ['Shimla', 'Himachal Pradesh', 31.1048, 77.1734], ['Amritsar', 'Punjab', 31.634, 74.8723],
  ['Ludhiana', 'Punjab', 30.901, 75.8573], ['Noida', 'Uttar Pradesh', 28.5355, 77.391], ['Gurugram', 'Haryana', 28.4595, 77.0266],
  ['Faridabad', 'Haryana', 28.4089, 77.3178], ['Ghaziabad', 'Uttar Pradesh', 28.6692, 77.4538], ['Kanpur', 'Uttar Pradesh', 26.4499, 80.3319],
  ['Varanasi', 'Uttar Pradesh', 25.3176, 82.9739], ['Agra', 'Uttar Pradesh', 27.1767, 78.0081], ['Udaipur', 'Rajasthan', 24.5854, 73.7125],
  ['Jodhpur', 'Rajasthan', 26.2389, 73.0243], ['Rajkot', 'Gujarat', 22.3039, 70.8022], ['Nashik', 'Maharashtra', 19.9975, 73.7898],
  ['Aurangabad', 'Maharashtra', 19.8762, 75.3433], ['Thane', 'Maharashtra', 19.2183, 72.9781], ['Madurai', 'Tamil Nadu', 9.9252, 78.1198],
  ['Tiruchirappalli', 'Tamil Nadu', 10.7905, 78.7047], ['Thiruvananthapuram', 'Kerala', 8.5241, 76.9366], ['Calicut', 'Kerala', 11.2588, 75.7804],
  ['Raipur', 'Chhattisgarh', 21.2514, 81.6296], ['Jamshedpur', 'Jharkhand', 22.8046, 86.2029], ['Meerut', 'Uttar Pradesh', 28.9845, 77.7064],
]
const COLOR_PRESETS = ['White', 'Black', 'Silver', 'Grey', 'Red', 'Blue', 'Brown', 'Green']
const initialForm = {
  make: 'Maruti Suzuki', car_model: '', year: 2024, color: 'White', registration_number: '', category_id: '', vehicle_type_id: '',
  transmission: 'manual', fuel_type: 'petrol', seats: 5, has_ac: true, has_music_system: true, has_gps_tracker: false,
  has_keyless_entry: false, has_sunroof: false, has_child_seat: false, has_luggage_carrier: false, description: '',
  location_city: 'Bengaluru', location_area: '', location_address: '', location_lat: 12.9716, location_lng: 77.5946,
  price_per_hour: 120, price_per_day: 2160, security_deposit: 0, included_km_per_day: 300, extra_km_charge: 8,
  min_trip_hours: 4, max_trip_days: 30, auto_accept_bookings: false, photos: [],
}

const schemas = [
  z.object({ make: z.string().min(1), car_model: z.string().min(1), year: z.number(), registration_number: z.string().min(6), category_id: z.string().min(1), vehicle_type_id: z.string().optional(), transmission: z.string(), fuel_type: z.string(), seats: z.number().min(2) }),
  z.object({ description: z.string().min(50).max(1000) }),
  z.object({ location_city: z.string().min(1), location_area: z.string().min(2), location_address: z.string().min(10), location_lat: z.number(), location_lng: z.number() }),
  z.object({ price_per_hour: z.number().min(20), price_per_day: z.number().min(100), included_km_per_day: z.number().min(0), extra_km_charge: z.number().min(0), min_trip_hours: z.number(), max_trip_days: z.number() }),
  z.object({ photos: z.array(z.any()).min(3) }),
  z.object({}),
]

export const useCarWizardStore = create(persist((set) => ({
  step: 0,
  form: initialForm,
  setStep: (step) => set({ step }),
  updateForm: (patch) => set((state) => ({ form: { ...state.form, ...patch } })),
  reset: () => set({ step: 0, form: initialForm }),
}), { name: 'sigfleet_vehicle_wizard' }))

function cityCenter(cityName) {
  const found = CITIES.find(([city]) => city === cityName)
  return found ? [found[2], found[3]] : [12.9716, 77.5946]
}

function LocationPicker({ form, updateForm }) {
  function MapEvents() {
    useMapEvents({
      click(event) {
        updateForm({ location_lat: event.latlng.lat, location_lng: event.latlng.lng })
      },
    })
    return null
  }
  const position = [Number(form.location_lat), Number(form.location_lng)]
  return (
    <div className="mt-4 overflow-hidden rounded-md border border-zinc-200">
      <MapContainer key={form.location_city} center={position} zoom={12} className="h-72 w-full">
        <TileLayer url={import.meta.env.VITE_MAPS_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'} />
        <MapEvents />
        <Marker position={position} draggable eventHandlers={{ dragend: (event) => updateForm({ location_lat: event.target.getLatLng().lat, location_lng: event.target.getLatLng().lng }) }} />
        <Circle center={position} radius={200} pathOptions={{ color: '#E31837', fillOpacity: 0.08 }} />
      </MapContainer>
    </div>
  )
}

export default function ListCarPage({ editMode = false, carId = null, initialData = null }) {
  const { step, setStep, form, updateForm, reset } = useCarWizardStore()
  const [error, setError] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const { categories, vehicleTypes } = useVehicleCategories()
  const activeForm = form
  const stepNames = ['Basic Info', 'Features', 'Location', 'Pricing', 'Photos', 'Review']

  useEffect(() => {
    if (initialData) {
      updateForm(initialData)
    }
  }, [initialData, updateForm])

  useEffect(() => {
    if (!activeForm.category_id && categories.length) updateForm({ category_id: categories[0].id })
    if (!activeForm.vehicle_type_id && vehicleTypes.length) updateForm({ vehicle_type_id: vehicleTypes[0].id })
  }, [activeForm.category_id, activeForm.vehicle_type_id, categories, updateForm, vehicleTypes])

  function validateStep(nextStep = step) {
    const parsed = schemas[nextStep].safeParse(activeForm)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Please complete this step.')
      return false
    }
    setError('')
    return true
  }

  function next() {
    if (validateStep()) setStep(Math.min(step + 1, stepNames.length - 1))
  }

  async function submit() {
    if (!schemas.every((schema) => schema.safeParse(activeForm).success)) {
      setError('Please complete all required fields before submitting.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const body = buildCarPayload(activeForm)
      const response = editMode ? await api.patch(`/cars/${carId}`, body) : await api.post('/cars', body)
      const targetCarId = carId || response.data.car_id
      if (!editMode) {
        for (const photo of activeForm.photos) {
          const data = new FormData()
          data.append('file', photo.file)
          await api.post(`/cars/${targetCarId}/images`, data)
        }
        reset()
      }
      setSubmitted(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Unable to submit listing.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <section className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase text-sigfleet">Manager garage</p>
            <h1 className="text-3xl font-black text-zinc-950">{editMode ? 'Edit car listing' : 'List your car'}</h1>
          </div>
          <div className="rounded-md bg-white px-4 py-3 text-sm font-bold text-zinc-600 shadow-sm">Step {step + 1} of {stepNames.length}</div>
        </div>
        <div className="mb-6 h-2 overflow-hidden rounded-full bg-zinc-200">
          <div className="h-full bg-sigfleet transition-all" style={{ width: `${((step + 1) / stepNames.length) * 100}%` }} />
        </div>
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
            {stepNames.map((name, index) => (
              <button key={name} onClick={() => setStep(index)} className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-bold ${index === step ? 'bg-sigfleet text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${index < step ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{index < step ? <Check size={14} /> : index + 1}</span>
                {name}
              </button>
            ))}
          </aside>
          <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            {error && <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
            {submitted ? <SubmittedState /> : (
              <>
                {step === 0 && <BasicStep form={activeForm} updateForm={updateForm} categories={categories} vehicleTypes={vehicleTypes} />}
                {step === 1 && <FeatureStep form={activeForm} updateForm={updateForm} />}
                {step === 2 && <LocationStep form={activeForm} updateForm={updateForm} />}
                {step === 3 && <PricingStep form={activeForm} updateForm={updateForm} />}
                {step === 4 && <PhotosStep form={activeForm} updateForm={updateForm} editMode={editMode} />}
                {step === 5 && <ReviewStep form={activeForm} setStep={setStep} />}
                <div className="mt-8 flex justify-between border-t border-zinc-200 pt-5">
                  <button disabled={step === 0} onClick={() => setStep(Math.max(step - 1, 0))} className="rounded-md border border-zinc-300 px-4 py-3 font-bold text-zinc-700 disabled:opacity-40">Back</button>
                  {step < 5 ? (
                    <button onClick={next} className="rounded-md bg-sigfleet px-5 py-3 font-bold text-white">Next</button>
                  ) : (
                    <button onClick={submit} disabled={isSubmitting} className="inline-flex min-w-36 items-center justify-center rounded-md bg-sigfleet px-5 py-3 font-bold text-white disabled:opacity-70">
                      {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : editMode ? 'Save changes' : 'Submit listing'}
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

function buildCarPayload(form) {
  return {
    title: `${form.year} ${form.make} ${form.car_model}`,
    make: form.make,
    car_model: form.car_model,
    year: Number(form.year),
    color: form.color,
    registration_number: form.registration_number,
    category_id: form.category_id,
    vehicle_type_id: form.vehicle_type_id || undefined,
    transmission: form.transmission,
    fuel_type: form.fuel_type,
    seats: Number(form.seats),
    description: form.description,
    location_city: form.location_city,
    location_area: form.location_area,
    location_address: form.location_address,
    location_lat: Number(form.location_lat),
    location_lng: Number(form.location_lng),
    price_per_hour: Number(form.price_per_hour),
    price_per_day: Number(form.price_per_day),
    security_deposit: Number(form.security_deposit),
    included_km_per_day: Number(form.included_km_per_day),
    extra_km_charge: Number(form.extra_km_charge),
    min_trip_hours: Number(form.min_trip_hours),
    max_trip_days: Number(form.max_trip_days),
    auto_accept_bookings: Boolean(form.auto_accept_bookings),
    has_ac: Boolean(form.has_ac),
    has_music_system: Boolean(form.has_music_system),
    has_gps_tracker: Boolean(form.has_gps_tracker),
    has_keyless_entry: Boolean(form.has_keyless_entry),
    has_sunroof: Boolean(form.has_sunroof),
    has_child_seat: Boolean(form.has_child_seat),
    has_luggage_carrier: Boolean(form.has_luggage_carrier),
  }
}

function BasicStep({ form, updateForm, categories, vehicleTypes }) {
  const suggestions = MODEL_SUGGESTIONS[form.make] || []
  return (
    <div>
      <StepTitle icon={Car} title="Basic Info" />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Make"><input list="brands" value={form.make} onChange={(e) => updateForm({ make: e.target.value })} className="input" /><datalist id="brands">{BRANDS.map((brand) => <option key={brand} value={brand} />)}</datalist></Field>
        <Field label="Car Model"><input list="models" value={form.car_model} onChange={(e) => updateForm({ car_model: e.target.value })} className="input" /><datalist id="models">{suggestions.map((model) => <option key={model} value={model} />)}</datalist></Field>
        <Field label="Year"><select value={form.year} onChange={(e) => updateForm({ year: Number(e.target.value) })} className="input">{Array.from({ length: 15 }, (_, i) => 2024 - i).map((year) => <option key={year}>{year}</option>)}</select></Field>
        <Field label="Registration Number"><input value={form.registration_number} onChange={(e) => updateForm({ registration_number: e.target.value.toUpperCase() })} className="input" placeholder="KA01AB1234" /></Field>
      </div>
      <div className="mt-5">
        <p className="label">Color</p>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">{COLOR_PRESETS.map((color) => <button key={color} onClick={() => updateForm({ color })} className={`rounded-md border px-3 py-2 text-sm font-bold ${form.color === color ? 'border-sigfleet text-sigfleet' : 'border-zinc-200 text-zinc-600'}`}>{color}</button>)}</div>
      </div>
      <SelectorGrid label="Category" options={categories.map((item) => ({ value: item.id, label: item.name }))} value={form.category_id} onChange={(category_id) => updateForm({ category_id })} />
      <SelectorGrid label="Vehicle Type" options={vehicleTypes.map((item) => ({ value: item.id, label: item.name }))} value={form.vehicle_type_id} onChange={(vehicle_type_id) => updateForm({ vehicle_type_id })} />
      <CardOptions label="Transmission" options={['manual', 'automatic']} value={form.transmission} onChange={(transmission) => updateForm({ transmission })} />
      <CardOptions label="Fuel Type" options={['petrol', 'diesel', 'electric', 'hybrid', 'cng']} value={form.fuel_type} onChange={(fuel_type) => updateForm({ fuel_type })} />
      <CardOptions label="Seats" options={[2, 4, 5, 6, 7, 8]} value={form.seats} onChange={(seats) => updateForm({ seats: Number(seats) })} />
    </div>
  )
}

function FeatureStep({ form, updateForm }) {
  const features = [
    ['has_ac', 'AC', Snowflake], ['has_music_system', 'Music System', Music], ['has_gps_tracker', 'GPS Tracker', Navigation],
    ['has_keyless_entry', 'Keyless Entry', Shield], ['has_sunroof', 'Sunroof', Sun], ['has_child_seat', 'Child Seat', Armchair],
    ['has_luggage_carrier', 'Luggage Carrier', Upload],
  ]
  return (
    <div>
      <StepTitle icon={Gauge} title="Features & Description" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{features.map(([key, label, Icon]) => (
        <button key={key} onClick={() => updateForm({ [key]: !form[key] })} className={`flex items-center gap-3 rounded-md border p-4 text-left font-bold ${form[key] ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-200 text-zinc-700'}`}>
          <Icon size={22} /> {label}
        </button>
      ))}</div>
      <Field label="Description" className="mt-6"><textarea value={form.description} onChange={(e) => updateForm({ description: e.target.value })} maxLength={1000} rows={6} className="input" /></Field>
      <div className="mt-2 flex items-center justify-between text-xs font-semibold text-zinc-500"><span>Minimum 50 characters</span><span>{form.description.length}/1000</span></div>
      <details className="mt-4 rounded-md border border-zinc-200 p-4 text-sm text-zinc-600">
        <summary className="cursor-pointer font-bold text-zinc-900">Good description tips</summary>
        <p className="mt-3">Mention cleanliness, parking access, recent service, comfort, luggage space, and pickup instructions.</p>
      </details>
    </div>
  )
}

function LocationStep({ form, updateForm }) {
  return (
    <div>
      <StepTitle icon={MapPin} title="Location" />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="City"><select value={form.location_city} onChange={(e) => { const center = cityCenter(e.target.value); updateForm({ location_city: e.target.value, location_lat: center[0], location_lng: center[1] }) }} className="input">{CITIES.map(([city, state]) => <option key={city} value={city}>{city}, {state}</option>)}</select></Field>
        <Field label="Area/Locality"><input value={form.location_area} onChange={(e) => updateForm({ location_area: e.target.value })} className="input" /></Field>
      </div>
      <Field label="Full address" className="mt-4"><textarea value={form.location_address} onChange={(e) => updateForm({ location_address: e.target.value })} rows={3} className="input" /></Field>
      <LocationPicker form={form} updateForm={updateForm} />
      <p className="mt-3 text-sm font-semibold text-zinc-500">Exact address only shared with confirmed guests.</p>
    </div>
  )
}

function PricingStep({ form, updateForm }) {
  const earnings = useMemo(() => Math.round(Number(form.price_per_day || 0) * 15 * 0.85), [form.price_per_day])
  function setHourly(value) {
    const hourly = Number(value)
    updateForm({ price_per_hour: hourly, price_per_day: Number(form.price_per_day) || hourly * 18 })
  }
  return (
    <div>
      <StepTitle icon={IndianRupee} title="Pricing" />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Price per hour"><input type="number" min="20" value={form.price_per_hour} onChange={(e) => setHourly(e.target.value)} className="input" /></Field>
        <Field label="Price per day"><input type="number" value={form.price_per_day} onChange={(e) => updateForm({ price_per_day: Number(e.target.value) })} className="input" /></Field>
        <Field label="Security deposit"><input type="number" value={form.security_deposit} onChange={(e) => updateForm({ security_deposit: Number(e.target.value) })} className="input" /></Field>
        <Field label="Included KM per day"><input type="number" value={form.included_km_per_day} onChange={(e) => updateForm({ included_km_per_day: Number(e.target.value) })} className="input" /></Field>
        <Field label="Extra KM charge"><input type="number" value={form.extra_km_charge} onChange={(e) => updateForm({ extra_km_charge: Number(e.target.value) })} className="input" /></Field>
        <Field label="Minimum trip duration"><select value={form.min_trip_hours} onChange={(e) => updateForm({ min_trip_hours: Number(e.target.value) })} className="input">{[2, 4, 8, 12, 24].map((hours) => <option key={hours} value={hours}>{hours}h</option>)}</select></Field>
      </div>
      <div className="mt-6 rounded-md border border-zinc-200 p-4">
        <p className="label">Maximum trip duration: {form.max_trip_days} days</p>
        <Slider.Root value={[form.max_trip_days]} max={30} min={1} step={1} onValueChange={([max_trip_days]) => updateForm({ max_trip_days })} className="relative mt-4 flex h-5 items-center">
          <Slider.Track className="relative h-2 grow rounded-full bg-zinc-200"><Slider.Range className="absolute h-full rounded-full bg-sigfleet" /></Slider.Track>
          <Slider.Thumb className="block h-5 w-5 rounded-full border-2 border-sigfleet bg-white shadow" />
        </Slider.Root>
      </div>
      <label className="mt-5 flex items-center justify-between rounded-md border border-zinc-200 p-4">
        <span><strong>Auto-accept bookings</strong><span className="block text-sm text-zinc-500">Use this when your car calendar is always accurate.</span></span>
        <input type="checkbox" checked={form.auto_accept_bookings} onChange={(e) => updateForm({ auto_accept_bookings: e.target.checked })} className="h-5 w-5 rounded text-sigfleet" />
      </label>
      <div className="mt-5 rounded-md bg-zinc-950 p-5 text-white">If booked 15 days/month: Estimated ~₹{earnings.toLocaleString('en-IN')} in earnings</div>
    </div>
  )
}

function PhotosStep({ form, updateForm, editMode }) {
  const onDrop = (acceptedFiles) => {
    const next = [...form.photos, ...acceptedFiles.slice(0, 10 - form.photos.length).map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), primary: form.photos.length === 0 }))]
    updateForm({ photos: next.slice(0, 10) })
  }
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/jpeg': [], 'image/png': [], 'image/webp': [] }, maxSize: 5 * 1024 * 1024, maxFiles: 10 })
  const reorder = (dragIndex, dropIndex) => {
    const next = [...form.photos]
    const [item] = next.splice(dragIndex, 1)
    next.splice(dropIndex, 0, item)
    updateForm({ photos: next })
  }
  return (
    <div>
      <StepTitle icon={Upload} title="Photos" />
      <div {...getRootProps()} className={`grid cursor-pointer place-items-center rounded-md border-2 border-dashed p-8 text-center ${isDragActive ? 'border-sigfleet bg-red-50' : 'border-zinc-300'}`}>
        <input {...getInputProps()} />
        <Upload className="text-sigfleet" size={34} />
        <p className="mt-3 font-bold text-zinc-900">Drag and drop photos, or click to browse</p>
        <p className="mt-1 text-sm text-zinc-500">JPG, PNG, WEBP. Max 5MB each. Max 10 photos.</p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {form.photos.map((photo, index) => (
          <div key={photo.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', index)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => reorder(Number(e.dataTransfer.getData('text/plain')), index)} className="relative overflow-hidden rounded-md border border-zinc-200">
            <img src={photo.url} alt="" className="h-40 w-full object-cover" />
            <div className="absolute right-2 top-2 flex gap-2">
              <button onClick={() => updateForm({ photos: form.photos.map((item) => ({ ...item, primary: item.id === photo.id })) })} className={`grid h-9 w-9 place-items-center rounded-full ${photo.primary ? 'bg-yellow-400 text-zinc-950' : 'bg-white text-zinc-600'}`}><Star size={18} /></button>
              <button onClick={() => updateForm({ photos: form.photos.filter((item) => item.id !== photo.id) })} className="grid h-9 w-9 place-items-center rounded-full bg-white text-zinc-700"><X size={18} /></button>
            </div>
            <div className="h-1 bg-sigfleet" style={{ width: editMode ? '100%' : '0%' }} />
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-md bg-zinc-50 p-4 text-sm font-semibold text-zinc-600">Photo tips checklist: Front view | Back view | Interior | Dashboard | Trunk</div>
    </div>
  )
}

function ReviewStep({ form, setStep }) {
  return (
    <div>
      <StepTitle icon={Check} title="Review & Submit" />
      {[
        ['Car Details', `${form.year} ${form.make} ${form.car_model} | ${form.category_name || form.category_id} | ${form.transmission}`, 0],
        ['Location & Features', `${form.location_area}, ${form.location_city} | ${_featureCount(form)} features`, 1],
        ['Pricing', `₹${Number(form.price_per_day).toLocaleString('en-IN')}/day | ₹${form.security_deposit} deposit`, 3],
      ].map(([title, detail, target]) => (
        <div key={title} className="mb-4 rounded-md border border-zinc-200 p-4">
          <div className="flex items-center justify-between gap-4"><h3 className="font-black text-zinc-950">{title}</h3><button onClick={() => setStep(target)} className="font-bold text-sigfleet">Edit</button></div>
          <p className="mt-2 text-zinc-600">{detail}</p>
        </div>
      ))}
    </div>
  )
}

function SubmittedState() {
  return (
    <div className="grid min-h-96 place-items-center text-center">
      <div>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={34} /></div>
        <h2 className="mt-5 text-3xl font-black text-zinc-950">Listing Submitted for Review</h2>
        <p className="mt-3 text-zinc-600">We'll review your listing within 24 hours and notify you.</p>
        <a href="/manager/cars" className="mt-6 inline-flex rounded-md bg-sigfleet px-5 py-3 font-bold text-white">Go to My Cars</a>
      </div>
    </div>
  )
}

function StepTitle({ icon: Icon, title }) {
  return <div className="mb-6 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md bg-red-50 text-sigfleet"><Icon size={22} /></span><h2 className="text-2xl font-black text-zinc-950">{title}</h2></div>
}

function Field({ label, children, className = '' }) {
  return <label className={`block ${className}`}><span className="label">{label}</span><div className="mt-2">{children}</div></label>
}

function SelectorGrid({ label, options, value, onChange }) {
  return <div className="mt-5"><p className="label">{label}</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{options.map((option) => {
    const item = typeof option === 'string' ? { value: option, label: option } : option
    return <button key={item.value} onClick={() => onChange(item.value)} className={`rounded-md border px-3 py-3 text-sm font-bold capitalize ${value === item.value ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-200 text-zinc-600'}`}>{item.label}</button>
  })}</div></div>
}

function CardOptions({ label, options, value, onChange }) {
  return <div className="mt-5"><p className="label">{label}</p><div className="mt-2 flex flex-wrap gap-2">{options.map((option) => <button key={option} onClick={() => onChange(option)} className={`rounded-md border px-4 py-3 text-sm font-bold capitalize ${String(value) === String(option) ? 'border-sigfleet bg-red-50 text-sigfleet' : 'border-zinc-200 text-zinc-600'}`}>{option}{option === 8 ? '+' : ''}</button>)}</div></div>
}

function _featureCount(form) {
  return ['has_ac', 'has_music_system', 'has_gps_tracker', 'has_keyless_entry', 'has_sunroof', 'has_child_seat', 'has_luggage_carrier'].filter((key) => form[key]).length
}
