import { useState } from "react"
import { MessageSquare, Plus, Trash2, History, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { GenieConversation } from "@/types"

interface ConversationSidebarProps {
  conversations: GenieConversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  isLoading?: boolean
  open?: boolean
  onClose?: () => void
}

function groupConversations(convs: GenieConversation[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const thisWeek = new Date(today.getTime() - today.getDay() * 86400000)
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const groups: { label: string; convs: GenieConversation[] }[] = [
    { label: "Today", convs: [] },
    { label: "Yesterday", convs: [] },
    { label: "This Week", convs: [] },
    { label: "This Month", convs: [] },
    { label: "Earlier", convs: [] },
  ]

  for (const conv of convs) {
    const d = new Date(conv.updatedAt)
    if (d >= today) {
      groups[0].convs.push(conv)
    } else if (d >= yesterday) {
      groups[1].convs.push(conv)
    } else if (d >= thisWeek) {
      groups[2].convs.push(conv)
    } else if (d >= thisMonth) {
      groups[3].convs.push(conv)
    } else {
      groups[4].convs.push(conv)
    }
  }

  return groups.filter((g) => g.convs.length > 0)
}

function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isLoading,
  open = false,
  onClose,
}: ConversationSidebarProps) {
  const groups = groupConversations(conversations)
  const [confirmDelete, setConfirmDelete] = useState<GenieConversation | null>(null)

  const handleSelect = (id: string) => {
    onSelect(id)
    onClose?.()
  }

  const handleNew = () => {
    onNew()
    onClose?.()
  }

  const handleConfirmDelete = () => {
    if (confirmDelete) {
      onDelete(confirmDelete.id)
    }
    setConfirmDelete(null)
  }

  return (
    <>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border/60 bg-card/50 shadow-2xl transition-transform duration-200 ease-in-out",
          "lg:relative lg:z-auto lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 p-3">
          <Button
            variant="outline"
            className="flex-1 justify-start gap-2 text-sm"
            onClick={handleNew}
          >
            <Plus className="size-4" />
            New conversation
          </Button>
          {onClose && (
            <button
              type="button"
              aria-label="Close conversations"
              onClick={onClose}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            >
              <X className="size-5" />
            </button>
          )}
        </div>

        <Separator />

        <div className="flex items-center gap-2 px-4 py-2.5">
          <History className="size-3.5 text-muted-foreground/60" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            History
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
          {isLoading ? (
            <div className="space-y-2 px-2 pt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <MessageSquare className="size-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground/50">
                No conversations yet
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.label}>
                  <h4 className="px-2 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">
                    {group.label}
                  </h4>
                  <div className="space-y-0.5">
                    {group.convs.map((conv) => (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => handleSelect(conv.id)}
                        className={cn(
                          "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                          conv.id === activeId
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        <MessageSquare className="size-3.5 shrink-0 opacity-60" />
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {conv.title}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDelete(conv)
                          }}
                          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </nav>
      </aside>

      {open && (
        <div
          aria-hidden
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription>
              "{confirmDelete?.title}" and its messages will be permanently removed. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export { ConversationSidebar }
export type { ConversationSidebarProps }
