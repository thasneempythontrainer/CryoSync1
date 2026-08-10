import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemeMode = 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  toggleTheme: () => void
  setTheme: (mode: ThemeMode) => void
}

const applyTheme = (mode: ThemeMode) => {
  if (mode === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

const getInitialTheme = (): ThemeMode => {
  const stored = localStorage.getItem('theme-storage')
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      if (parsed?.state?.mode === 'light' || parsed?.state?.mode === 'dark') {
        return parsed.state.mode
      }
    } catch {
      // ignore parse errors
    }
  }
  return 'dark'
}

const initialMode = getInitialTheme()
applyTheme(initialMode)

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: initialMode,
      toggleTheme: () =>
        set((state) => {
          const next = state.mode === 'light' ? 'dark' : 'light'
          applyTheme(next)
          return { mode: next }
        }),
      setTheme: (mode) => {
        applyTheme(mode)
        set({ mode })
      },
    }),
    {
      name: 'theme-storage',
    },
  ),
)
