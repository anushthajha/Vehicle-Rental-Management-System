import React from 'react'
import { AuthenticatedOutlet } from './guardUtils'

export default function PrivateRoute() {
  return <AuthenticatedOutlet />
}
