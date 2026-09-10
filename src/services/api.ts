import { useAuthStore } from '@/store'

export interface ApiClient {
  get<T>(path: string, params?: Record<string, string>): Promise<T>
  post<T>(path: string, body: unknown): Promise<T>
  put<T>(path: string, body: unknown): Promise<T>
  delete<T>(path: string): Promise<T>
  upload<T>(path: string, body: FormData): Promise<T>
}

const API_BASE: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api"

function handleUnauthorized() {
  useAuthStore.getState().clearSession()
  if (window.location.pathname !== '/login') {
    const from = encodeURIComponent(window.location.pathname + window.location.search)
    window.location.assign(`/login?from=${from}`)
  }
}

export class RealApiClient implements ApiClient {
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${API_BASE}${path}`
    const headers: Record<string, string> = {}
    if (init?.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json"

    const token = useAuthStore.getState().token
    if (token) headers["Authorization"] = `Bearer ${token}`

    let res: Response
    try {
      res = await fetch(url, { ...init, headers })
    } catch {
      throw new Error(
        "Unable to reach the CryoSync API. Check that the backend is running on port 8000.",
      )
    }

    if (res.status === 401 && !path.startsWith('/auth/login')) {
      handleUnauthorized()
    }

    if (!res.ok) {
      let detail = ""
      try {
        const body = await res.json()
        detail = body?.detail ?? ""
      } catch {
        // Non-JSON error body
      }
      const message = detail ? String(detail) : res.statusText
      throw new Error(`API error ${res.status}: ${message}`)
    }

    return res.json() as Promise<T>
  }

  get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let p = path
    if (params) {
      const qs = new URLSearchParams(params).toString()
      if (qs) p += `?${qs}`
    }
    return this.request<T>(p)
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", body: JSON.stringify(body) })
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "PUT", body: JSON.stringify(body) })
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" })
  }

  upload<T>(path: string, body: FormData): Promise<T> {
    return this.request<T>(path, { method: "POST", body })
  }
}

export const apiClient = new RealApiClient()
