"use client"

import { type ComponentType } from "react"
import { NavLink } from "react-router-dom"
import {
  LayoutDashboard,
  Baby,
  Users,
  Database,
  ShieldCheck,
  Heart,
  CreditCard,
  UserPlus,
  Building2,
  FileText,
  Siren,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  Scan,
  FileSpreadsheet,
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
  { label: "CBU Tracking", href: "/cbus", icon: Baby },
  { label: "Families & Care", href: "/customers", icon: Users },
  { label: "Cryostorage", href: "/storage", icon: Database },
  { label: "Compliance", href: "/compliance", icon: ShieldCheck },
  { label: "Clinical Release", href: "/transplants", icon: Heart },
  { label: "Plans & Billing", href: "/payments", icon: CreditCard },
  { label: "Branch Network", href: "/referrals", icon: UserPlus },
  { label: "Collection Branches", href: "/franchisees", icon: Building2 },
  { label: "Knowledge Hub", href: "/content", icon: FileText },
  { label: "Quality Report", href: "/report", icon: Siren },
  { label: "AI Extract", href: "/extract", icon: Scan },
  { label: "Lab Reports", href: "/lab-reports", icon: FileSpreadsheet },
  { label: AGENT_NAV_LABEL, href: "/genie", icon: AgentMark },
  { label: "Admin", href: "/admin", icon: Settings },
]

function Sidebar() {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useAppStore((state) => state.toggleSidebar)
  const mobileNavOpen = useAppStore((state) => state.mobileNavOpen)
  const closeMobileNav = useAppStore((state) => state.closeMobileNav)
  const user = useAuthStore((state) => state.user)

  const visibleNavItems = navItems.filter((item) => canAccessPage(user?.role, item.href))

  const initials = user
    ? (user.displayName ?? "")
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
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card text-foreground",
          "transition-[width] duration-150 ease-out",
          "lg:relative lg:z-10",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0",
          sidebarCollapsed ? "lg:w-14" : "lg:w-56",
          "w-56",
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "flex h-11 shrink-0 items-center border-b border-border",
            sidebarCollapsed ? "justify-center px-0" : "gap-2.5 px-4",
          )}
        >
          <BrandMark className="size-6 shrink-0" />
          {!sidebarCollapsed && (
            <span className="font-heading text-[13px] font-semibold tracking-tight">
              CryoSync
            </span>
          )}
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeMobileNav}
            className="ml-auto inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {visibleNavItems.map((item) => {
            const Icon = item.icon

            const link = (
              <NavLink
                to={item.href}
                onClick={closeMobileNav}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-2.5 rounded px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                    sidebarCollapsed && "justify-center px-2",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-4 w-px -translate-y-1/2 bg-foreground" />
                    )}
                    <Icon className="size-4 shrink-0" />
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

        {/* User */}
        {user && (
          <div className="shrink-0 border-t border-border p-2">
            <div
              className={cn(
                "flex items-center gap-2.5 rounded px-2.5 py-1.5",
                sidebarCollapsed && "justify-center px-2",
              )}
            >
              <Avatar size="sm">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              {!sidebarCollapsed && (
                <div className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[12px] font-medium text-foreground">
                    {user.displayName}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <div className="hidden shrink-0 border-t border-border p-2 lg:block">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className={cn(
                    "inline-flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                    "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    sidebarCollapsed ? "justify-center px-2" : "justify-start",
                  )}
                />
              }
            >
              {sidebarCollapsed ? (
                <ChevronRight className="size-3.5" />
              ) : (
                <>
                  <ChevronLeft className="size-3.5" />
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

      {/* Mobile overlay */}
      {mobileNavOpen && (
        <div
          aria-hidden
          onClick={closeMobileNav}
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden"
        />
      )}
    </>
  )
}

export { Sidebar }
