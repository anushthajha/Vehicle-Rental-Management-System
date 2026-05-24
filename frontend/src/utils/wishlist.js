const IDS_KEY = 'sigfleet_wishlist_ids'
const CARS_KEY = 'sigfleet_wishlist_cars'

export function getLocalWishlistIds() {
  try {
    return JSON.parse(localStorage.getItem(IDS_KEY) || '[]')
  } catch {
    return []
  }
}

export function isLocallySaved(carId) {
  return getLocalWishlistIds().includes(carId)
}

export function saveLocalWishlistCar(car) {
  const ids = new Set(getLocalWishlistIds())
  ids.add(car.id)
  localStorage.setItem(IDS_KEY, JSON.stringify([...ids]))

  const vehicles = getLocalWishlistCars().filter((item) => item.id !== car.id)
  localStorage.setItem(CARS_KEY, JSON.stringify([{ ...car, is_saved: true }, ...vehicles]))
}

export function removeLocalWishlistCar(carId) {
  localStorage.setItem(IDS_KEY, JSON.stringify(getLocalWishlistIds().filter((id) => id !== carId)))
  localStorage.setItem(CARS_KEY, JSON.stringify(getLocalWishlistCars().filter((car) => car.id !== carId)))
}

export function getLocalWishlistCars() {
  try {
    return JSON.parse(localStorage.getItem(CARS_KEY) || '[]')
  } catch {
    return []
  }
}
