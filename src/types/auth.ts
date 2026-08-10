export type UserRole = 'dock' | 'qa' | 'supervisor'

export interface AuthUser {
  id: string
  username: string
  email: string
  displayName: string
  title: string
  role: UserRole
}

export interface LoginResponse {
  token: string
  user: AuthUser
}
