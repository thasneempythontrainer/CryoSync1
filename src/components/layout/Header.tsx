import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  PanelLeft,
  Search,
  Bell,
  Moon,
  Sun,
  ChevronDown,
  Settings,
  LogOut,
  Command,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { AGENT_NAV_LABEL } from "@/lib/branding"
import { useAppStore } from "@/store/app-store"
import { useThemeStore } from "@/store/theme-store"
import { useAuthStore } from "@/store/auth-store"
import { logout } from "@/services"
import { can, canAccessPage, ROLE_LABELS } from "@/lib/permissions"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

function Header() {
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const mobileNavOpen = useAppStore((state) => state.mobileNavOpen)
  const setMobileNavOpen = useAppStore((state) => state.setMobileNavOpen)
  const breadcrumbs = useAppStore((state) => state.breadcrumbs)
  const notifications = useAppStore((state) => state.notifications)

  const mode = useThemeStore((state) => state.mode)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)

  const user = useAuthStore((state) => state.user)
  const token = useAuthStore((state) => state.token)
  const clearSession = useAuthStore((state) => state.clearSession)

  const unreadCount = notifications.filter((n) => !n.read).length

  const role = user?.role
  const initials = user
    ? (user.displayName ?? "")
        .replace(/^(Dr\.|Mr\.|Ms\.)\s+/i, "")
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "??"

  const handleSignOut = useCallback(() => {
    if (token) void logout(token).catch(() => {})
    clearSession()
    navigate("/login")
  }, [token, clearSession, navigate])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const handleSearchOpen = useCallback(() => setSearchOpen(true), [])
  const handleSearchClose = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery("")
  }, [])

  return (
    <>
      <header className="sticky top-0 z-30 flex h-11 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-sm sm:px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.matchMedia("(min-width: 1024px)").matches) {
                toggleSidebar()
              } else {
                setMobileNavOpen(!mobileNavOpen)
              }
            }}
            aria-label="Toggle navigation"
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PanelLeft className="size-4" />
          </button>

          {breadcrumbs.length > 0 && (
            <nav className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground/30">/</span>}
                  <span className={cn(i === breadcrumbs.length - 1 && "font-medium text-foreground")}>
                    {crumb.label}
                  </span>
                </span>
              ))}
            </nav>
          )}
        </div>

        <div className="flex flex-1 justify-center px-2 sm:px-4">
          <button
            type="button"
            onClick={handleSearchOpen}
            className="flex h-7 w-full max-w-sm min-w-0 cursor-pointer items-center gap-1.5 rounded border border-border bg-muted/30 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <Search className="size-3.5 shrink-0" />
            <span className="hidden flex-1 truncate text-left sm:inline">Search...</span>
            <kbd className="hidden items-center gap-0.5 rounded border border-border bg-background px-1 py-px text-[9px] font-medium text-muted-foreground sm:inline-flex">
              <Command className="size-2.5" />K
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger className="relative inline-flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <Badge
                  variant="default"
                  className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full p-0 text-[8px]"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <div className="px-1.5 py-6 text-center text-xs text-muted-foreground">
                    No new notifications
                  </div>
                ) : (
                  notifications.slice(0, 5).map((n) => (
                    <DropdownMenuItem key={n.id} className="flex-col items-start gap-0.5">
                      <span className="text-xs font-medium">{n.title}</span>
                      <span className="text-[11px] text-muted-foreground">{n.description}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((p) => !p)}
              className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Avatar size="sm">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden text-xs font-medium text-foreground md:inline">
                {user?.displayName ?? "Sign in"}
              </span>
              <ChevronDown className="hidden size-3 text-muted-foreground/50 md:block" />
            </button>

            {userMenuOpen && user && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 z-50 mt-1 w-52 origin-top-right rounded border border-border bg-popover p-1 text-popover-foreground shadow-lg" role="menu">
                  <div className="px-2 py-1.5" role="none">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium text-foreground">{user.displayName}</span>
                      <span className="text-[11px] text-muted-foreground">{user.title}</span>
                      <span className="text-[11px] text-muted-foreground">{user.email}</span>
                    </div>
                    <span className="mt-1.5 inline-flex rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                      {ROLE_LABELS[user.role]}
                    </span>
                  </div>
                  <div className="-mx-1 my-1 h-px bg-border" />
                  {can(role, "view:admin") && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setUserMenuOpen(false); navigate('/admin') }}
                        className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs outline-hidden select-none hover:bg-muted"
                      >
                        <Settings className="size-3.5" />
                        Settings
                      </button>
                      <div className="-mx-1 my-1 h-px bg-border" />
                    </>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs outline-hidden select-none hover:bg-muted"
                  >
                    <LogOut className="size-3.5" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <Dialog open={searchOpen} onOpenChange={handleSearchClose}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>Search pages, CBUs, and collection sites</DialogDescription>
        </DialogHeader>
        <DialogContent
          className="top-[15%] translate-y-0 overflow-hidden rounded-lg! p-0 sm:max-w-lg"
          showCloseButton={false}
        >
          <div className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search pages, CBUs, hospitals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
              />
              <kbd className="hidden items-center gap-0.5 rounded border border-border bg-muted px-1 py-px text-[9px] font-medium text-muted-foreground sm:inline-flex">
                ESC
              </kbd>
            </div>
            <div className="max-h-64 overflow-y-auto p-1.5">
              {searchQuery.length > 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No results found for &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="px-1.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Pages
                  </p>
                  {[
                    { label: "Dashboard", path: "/dashboard" },
                    { label: "CBU Tracking", path: "/cbus" },
                    { label: "Customers", path: "/customers" },
                    { label: "Storage", path: "/storage" },
                    { label: "Compliance", path: "/compliance" },
                    { label: "Transplants", path: "/transplants" },
                    { label: "Payments", path: "/payments" },
                    { label: AGENT_NAV_LABEL, path: "/genie" },
                    { label: "Admin", path: "/admin" },
                  ]
                    .filter((page) => canAccessPage(role, page.path))
                    .map((page) => (
                    <button
                      key={page.label}
                      type="button"
                      onClick={() => {
                        handleSearchClose()
                        navigate(page.path)
                      }}
                      className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                    >
                      {page.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export { Header }
