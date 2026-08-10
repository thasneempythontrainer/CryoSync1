import type { UserRole } from '@/types'

export const ROLE_LABELS: Record<UserRole, string> = {
  dock: 'Dock Receiving',
  qa: 'Quality Assurance',
  supervisor: 'Supervisor',
}

export type Permission =
  | 'view:receiving'
  | 'view:shipments'
  | 'view:compliance'
  | 'view:risk'
  | 'view:report'
  | 'view:genie'
  | 'view:admin'
  | 'act:create_shipment'
  | 'act:update_shipment_status'
  | 'act:delete_shipment'
  | 'act:resolve_incident'
  | 'act:assign_incident'

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  dock: ['view:receiving', 'view:shipments', 'view:report', 'view:genie', 'act:create_shipment', 'act:update_shipment_status'],
  qa: ['view:shipments', 'view:compliance', 'view:risk', 'view:report', 'view:genie', 'act:resolve_incident', 'act:assign_incident'],
  supervisor: [
    'view:receiving',
    'view:shipments',
    'view:compliance',
    'view:risk',
    'view:report',
    'view:genie',
    'view:admin',
    'act:create_shipment',
    'act:update_shipment_status',
    'act:delete_shipment',
    'act:resolve_incident',
    'act:assign_incident',
  ],
}

export function can(role: UserRole | undefined, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role].includes(permission)
}

export const PAGE_PERMISSIONS: Record<string, Permission> = {
  '/receiving': 'view:receiving',
  '/compliance': 'view:compliance',
  '/risk': 'view:risk',
  '/report': 'view:report',
  '/genie': 'view:genie',
  '/admin': 'view:admin',
}

export function canAccessPage(role: UserRole | undefined, path: string): boolean {
  const permission = PAGE_PERMISSIONS[path]
  if (!permission) return true
  return can(role, permission)
}
