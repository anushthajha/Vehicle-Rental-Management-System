import React from 'react'
import { RoleOutlet } from './guardUtils'

export default function AdminRoute() {
  return <RoleOutlet allowedRoles={['admin']} requiredRole="Admin" />
}
