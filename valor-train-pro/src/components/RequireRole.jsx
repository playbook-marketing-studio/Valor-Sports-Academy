import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

/** Gate a route group by role. Non-matching users go to the dashboard. */
export default function RequireRole({ roles }) {
  const { user } = useAuth();
  if (!user) return null;
  return roles.includes(user.role) ? <Outlet /> : <Navigate to="/" replace />;
}
