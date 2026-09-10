import type { UserRole } from '@/types'

export const ROLE_LABELS: Record<UserRole, string> = {
  collection: 'Collection Staff',
  processing: 'Processing Lab',
  cs: 'Customer Service',
  qa: 'Quality Assurance',
  admin: 'Administrator',
}

export type Permission =
  | 'view:cbus'
  | 'view:customers'
  | 'view:storage'
  | 'view:compliance'
  | 'view:payments'
  | 'view:referrals'
  | 'view:franchisees'
  | 'view:content'
  | 'view:report'
  | 'view:genie'
  | 'view:admin'
  | 'view:transplants'
  | 'act:create_cbu'
  | 'act:update_cbu_status'
  | 'act:resolve_event'
  | 'act:assign_event'

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  collection: ['view:cbus', 'view:customers', 'view:report', 'view:genie', 'act:create_cbu', 'act:update_cbu_status'],
  processing: ['view:cbus', 'view:storage', 'view:compliance', 'view:report', 'view:genie', 'act:update_cbu_status'],
  cs: ['view:cbus', 'view:customers', 'view:payments', 'view:referrals', 'view:content', 'view:genie'],
  qa: ['view:cbus', 'view:compliance', 'view:storage', 'view:report', 'view:genie', 'act:resolve_event', 'act:assign_event'],
  admin: [
    'view:cbus', 'view:customers', 'view:storage', 'view:compliance',
    'view:payments', 'view:referrals', 'view:franchisees', 'view:content',
    'view:report', 'view:genie', 'view:admin', 'view:transplants',
    'act:create_cbu', 'act:update_cbu_status', 'act:resolve_event', 'act:assign_event',
  ],
}

export function can(role: UserRole | undefined, permission: Permission): boolean {
  if (!role) return false
  const perms = ROLE_PERMISSIONS[role]
  if (!perms) return false
  return perms.includes(permission)
}

export const PAGE_PERMISSIONS: Record<string, Permission> = {
  '/cbus': 'view:cbus',
  '/customers': 'view:customers',
  '/storage': 'view:storage',
  '/compliance': 'view:compliance',
  '/transplants': 'view:transplants',
  '/payments': 'view:payments',
  '/referrals': 'view:referrals',
  '/franchisees': 'view:franchisees',
  '/content': 'view:content',
  '/report': 'view:report',
  '/genie': 'view:genie',
  '/admin': 'view:admin',
}

export function canAccessPage(role: UserRole | undefined, path: string): boolean {
  const permission = PAGE_PERMISSIONS[path]
  if (!permission) return true
  return can(role, permission)
}
