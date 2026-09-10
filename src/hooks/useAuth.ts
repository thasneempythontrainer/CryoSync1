import { useMemo } from 'react'

import { useAuthStore } from '@/store'
import { can as canWithRole, ROLE_LABELS, type Permission } from '@/lib/permissions'
import type { UserRole } from '@/types'

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const role = user?.role

  return useMemo(() => {
    const can = (permission: Permission) => canWithRole(role, permission)
    const roleLabel = role ? ROLE_LABELS[role] : undefined
    const isAdmin = role === 'admin'
    return { user, role: role as UserRole | undefined, can, roleLabel, isAdmin }
  }, [user, role])
}
