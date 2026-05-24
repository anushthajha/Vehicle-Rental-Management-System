import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

export function useVehicleTypes() {
  return useQuery({
    queryKey: ['vehicle-types'],
    queryFn: async () => {
      const response = await api.get('/vehicle-types')
      return response.data.vehicle_types || []
    },
    staleTime: 10 * 60 * 1000,
  })
}
