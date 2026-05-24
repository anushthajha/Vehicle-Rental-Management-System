import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

export function useVehicleCategories() {
  const categoriesQuery = useQuery({
    queryKey: ['vehicle-categories'],
    queryFn: async () => {
      const response = await api.get('/categories')
      return response.data.categories || []
    },
    staleTime: 10 * 60 * 1000,
  })
  const typesQuery = useQuery({
    queryKey: ['vehicle-types'],
    queryFn: async () => {
      const response = await api.get('/vehicle-types')
      return response.data.vehicle_types || []
    },
    staleTime: 10 * 60 * 1000,
  })
  return {
    categories: categoriesQuery.data || [],
    vehicleTypes: typesQuery.data || [],
    isLoading: categoriesQuery.isLoading || typesQuery.isLoading,
    error: categoriesQuery.error || typesQuery.error,
  }
}
