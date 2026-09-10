"use client"

import { type ReactNode } from "react"
import { useLocation } from "react-router-dom"

import { Sidebar } from "@/components/layout/Sidebar"
import { Header } from "@/components/layout/Header"
import { cn } from "@/lib/utils"

interface MainLayoutProps {
  children: ReactNode
}

function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation()
  const isFullBleed = location.pathname === "/genie"

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <Header />
        <main
          className={cn(
            "flex-1",
            isFullBleed ? "overflow-hidden" : "overflow-y-auto p-3 sm:p-4",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

export { MainLayout }
