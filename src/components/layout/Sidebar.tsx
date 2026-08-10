"use client"

import { type ComponentType } from "react"
import { NavLink } from "react-router-dom"
import {
  LayoutDashboard,
  PackageOpen,
  ShieldCheck,
  Settings,
  AlertTriangle,
  Siren,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { useAppStore } from "@/store/app-store"
import { useAuthStore } from "@/store/auth-store"
import { canAccessPage, ROLE_LABELS } from "@/lib/permissions"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { BrandMark } from "@/components/brand/BrandMark"
import { AgentMark } from "@/components/brand/AgentMark"
import { AGENT_NAV_LABEL } from "@/lib/branding"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

interface NavItem {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Receiving Intake", href: "/receiving", icon: PackageOpen },
  { label: "Compliance & Cold Chain", href: "/compliance", icon: ShieldCheck },
  { label: "Report Issue", href: "/report", icon: Siren },
  { label: "Risk & Stockout", href: "/risk", icon: AlertTriangle },
  { label: AGENT_NAV_LABEL, href: "/genie", icon: AgentMark },
  { label: "Admin & System Health", href: "/admin", icon: Settings },
]

function Sidebar() {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const mobileNavOpen = useAppStore((state) => state.mobileNavOpen)
  const closeMobileNav = useAppStore((state) => state.closeMobileNav)
  const user = useAuthStore((state) => state.user)

  const visibleNavItems = navItems.filter((item) => canAccessPage(user?.role, item.href))

  const initials = user
    ? user.displayName
        .replace(/^(Dr\.|Mr\.|Ms\.)\s+/i, "")
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "??"

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          "w-64 shadow-2xl transition-transform duration-200 ease-in-out",
          "lg:relative lg:z-10 lg:shadow-none lg:transition-[width]",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
          sidebarCollapsed ? "lg:w-16" : "lg:w-64",
        )}
      >
        <div
          className={cn(
            "relative flex h-18 shrink-0 items-center gap-3 border-b border-sidebar-border px-4",
            sidebarCollapsed && "justify-center px-0",
          )}
        >
          <div className="absolute inset-x-4 top-0 h-0.5 rounded-full gradient-brand shadow-[0_0_12px_rgba(56,189,248,0.8)]" />
          <BrandMark className="size-10 shrink-0 drop-shadow-[0_0_10px_rgba(56,189,248,0.45)]" />

          {!sidebarCollapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-heading text-lg font-bold tracking-tight text-gradient-brand">
                CryoSync
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-cyan-300/90">
                Cold-Chain Intelligence
              </span>
            </div>
          )}

          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeMobileNav}
            className="absolute top-3 right-3 inline-flex size-9 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {visibleNavItems.map((item) => {
            const Icon = item.icon

            const link = (
              <NavLink
                to={item.href}
                onClick={closeMobileNav}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    sidebarCollapsed && "justify-center px-2",
                    isActive
                      ? "bg-gradient-to-r from-primary/20 to-accent/10 text-sidebar-primary shadow-[0_0_20px_-6px_color-mix(in_oklch,var(--primary)_60%,transparent)]"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-cyan-300 to-violet-400 shadow-[0_0_10px_rgba(56,189,248,0.9)]" />
                    )}
                    <Icon className="size-5 shrink-0" />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </>
                )}
              </NavLink>
            )

            if (sidebarCollapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger>{link}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              )
            }

            return <div key={item.href}>{link}</div>
          })}
        </nav>

        {user && (
          <div className="shrink-0 border-t border-sidebar-border p-3">
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5",
                sidebarCollapsed && "justify-center px-2",
              )}
            >
              <Avatar size="sm">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              {!sidebarCollapsed && (
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-xs font-semibold text-sidebar-foreground">
                    {user.displayName}
                  </span>
                  <span className="truncate text-[11px] font-medium text-sidebar-primary">
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="hidden shrink-0 border-t border-sidebar-border p-3 lg:block">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className={cn(
                    "inline-flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                    sidebarCollapsed ? "justify-center px-2" : "justify-start",
                  )}
                />
              }
            >
              {sidebarCollapsed ? (
                <ChevronRight className="size-5" />
              ) : (
                <>
                  <ChevronLeft className="size-5" />
                  <span>Collapse</span>
                </>
              )}
            </TooltipTrigger>
            {sidebarCollapsed && (
              <TooltipContent side="right" sideOffset={8}>
                Expand
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>

      {mobileNavOpen && (
        <div
          aria-hidden
          onClick={closeMobileNav}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}
    </>
  )
}

export { Sidebar }
