import { apiClient } from '@/services/api'
import type { AuthUser, LoginResponse } from '@/types'

export async function login(username: string, password: string): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>('/auth/login', { username, password })
}

export async function fetchMe(token: string): Promise<{ user: AuthUser }> {
  return apiClient.get<{ user: AuthUser }>('/auth/me', { token })
}

export async function logout(token: string): Promise<unknown> {
  return apiClient.post('/auth/logout', { token })
}
