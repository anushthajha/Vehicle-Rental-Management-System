import React from 'react'
import { RoleOutlet } from './guardUtils'

export default function VehicleManagerRoute() {
  return <RoleOutlet allowedRoles={['vehicle_manager']} requiredRole="Vehicle Manager" />
}
