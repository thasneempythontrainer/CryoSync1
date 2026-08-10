import { Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import type { SuggestedQuestion } from "@/types"

interface SuggestedQuestionsProps {
  questions: SuggestedQuestion[]
  onSelect: (question: string) => void
  isLoading?: boolean
}

const CATEGORY_COLORS: Record<string, string> = {
  Operations:
    "border-l-blue-500 dark:border-l-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20",
  Quality:
    "border-l-amber-500 dark:border-l-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/20",
  Suppliers:
    "border-l-violet-500 dark:border-l-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-950/20",
  Inventory:
    "border-l-emerald-500 dark:border-l-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20",
  Compliance:
    "border-l-rose-500 dark:border-l-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/20",
  Dashboard:
    "border-l-cyan-500 dark:border-l-cyan-400 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/20",
}

function SuggestedQuestions({
  questions,
  onSelect,
  isLoading,
}: SuggestedQuestionsProps) {
  const grouped = questions.reduce<Record<string, SuggestedQuestion[]>>(
    (acc, q) => {
      if (!acc[q.category]) acc[q.category] = []
      acc[q.category].push(q)
      return acc
    },
    {}
  )

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl bg-muted/50"
          />
        ))}
      </div>
    )
  }

  if (questions.length === 0) return null

  return (
    <div className="w-full max-w-2xl space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="size-4" />
        <span>Suggested questions</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="space-y-2">
            <h4 className="px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {category}
            </h4>
            {items.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => onSelect(q.question)}
                className={cn(
                  "w-full rounded-xl border border-border/50 border-l-2 bg-card px-3.5 py-2.5 text-left text-sm text-foreground/80 shadow-xs transition-all duration-200 hover:shadow-sm",
                  CATEGORY_COLORS[q.category] ??
                    "border-l-border hover:bg-muted/50"
                )}
              >
                <span className="line-clamp-2 leading-snug">
                  {q.question}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export { SuggestedQuestions }
export type { SuggestedQuestionsProps }
