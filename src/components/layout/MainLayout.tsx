"use client"

import { type ReactNode } from "react"
import { useLocation } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"

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
    <div className="relative flex h-screen overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-40 [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_85%,transparent)]" />
        <div className="absolute -top-48 left-1/4 size-[38rem] rounded-full bg-primary/15 blur-[130px]" />
        <div className="absolute bottom-0 right-1/4 size-[32rem] rounded-full bg-accent/15 blur-[130px]" />
        <div className="absolute -bottom-28 left-16 size-80 rounded-full bg-cyan-400/10 blur-[110px]" />
      </div>
      <Sidebar />
      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className={cn("flex-1", isFullBleed ? "overflow-hidden" : "overflow-y-auto p-4 lg:p-6")}>
          <div className="flex h-full flex-col">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                className="flex min-h-0 flex-1 flex-col"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15, ease: "easeInOut" }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}

export { MainLayout }
