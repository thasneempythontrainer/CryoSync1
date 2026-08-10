import { create } from 'zustand'

type NotificationType = 'info' | 'warning' | 'error' | 'success'

interface Notification {
  id: string
  title: string
  description: string
  type: NotificationType
  read: boolean
  timestamp: string
}

interface GlobalFilters {
  facility: string
  dateRange: string
  search: string
}

interface Breadcrumb {
  label: string
  href?: string
}

interface AppState {
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  currentPage: string
  breadcrumbs: Breadcrumb[]
  globalSearchQuery: string
  notifications: Notification[]
  globalFilters: GlobalFilters

  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setMobileNavOpen: (open: boolean) => void
  closeMobileNav: () => void
  setCurrentPage: (page: string) => void
  setBreadcrumbs: (breadcrumbs: Breadcrumb[]) => void
  setGlobalSearchQuery: (query: string) => void
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void
  markNotificationRead: (id: string) => void
  clearNotifications: () => void
  setGlobalFilter: (key: string, value: string) => void
  resetGlobalFilters: () => void
}

let notificationCounter = 0

const defaultFilters: GlobalFilters = {
  facility: '',
  dateRange: '',
  search: '',
}

export const useAppStore = create<AppState>()((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  currentPage: 'dashboard',
  breadcrumbs: [],
  globalSearchQuery: '',
  notifications: [],
  globalFilters: { ...defaultFilters },

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),

  closeMobileNav: () => set({ mobileNavOpen: false }),

  setCurrentPage: (page) => set({ currentPage: page }),

  setBreadcrumbs: (breadcrumbs) => set({ breadcrumbs }),

  setGlobalSearchQuery: (query) => set({ globalSearchQuery: query }),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        {
          ...notification,
          id: `notif_${++notificationCounter}_${Date.now()}`,
          timestamp: new Date().toISOString(),
        },
        ...state.notifications,
      ],
    })),

  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    })),

  clearNotifications: () => set({ notifications: [] }),

  setGlobalFilter: (key, value) =>
    set((state) => ({
      globalFilters: { ...state.globalFilters, [key]: value },
    })),

  resetGlobalFilters: () => set({ globalFilters: { ...defaultFilters } }),
}))
