import React from 'react'
import { RoleOutlet } from './guardUtils'

export default function CustomerRoute() {
  return <RoleOutlet allowedRoles={['customer']} requiredRole="Customer" />
}
