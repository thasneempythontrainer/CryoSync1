import { useState, useCallback } from "react"
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface SqlViewerProps {
  sql: string
  defaultExpanded?: boolean
}

function SqlViewer({ sql, defaultExpanded = false }: SqlViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [sql])

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border/60 bg-muted/50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/70">
          SQL Query
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/50">
          {sql.split("\n").length} lines
        </span>
      </button>

      {expanded && (
        <div className="relative border-t border-border/40">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopy}
            className="absolute top-2 right-2 z-10 text-muted-foreground hover:text-foreground"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </Button>
          <pre className="overflow-x-auto p-3 pt-2 text-xs leading-relaxed">
            <code className="font-mono">
              {sql.split("\n").map((line, i) => (
                <span key={i} className="block whitespace-pre">
                  {highlightSql(line)}
                </span>
              ))}
            </code>
          </pre>
        </div>
      )}
    </div>
  )
}

const SQL_KEYWORDS =
  /(SELECT|FROM|WHERE|AND|OR|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|COUNT|SUM|AVG|MIN|MAX|GROUP BY|ORDER BY|LIMIT|OFFSET|HAVING|CASE|WHEN|THEN|ELSE|END|IN|BETWEEN|LIKE|IS|NOT|NULL|TRUE|FALSE|DESC|ASC|DISTINCT|CAST|COALESCE|NULLIF|ROUND|DATE|INTERVAL|NOW|CURRENT_DATE|CURRENT_TIMESTAMP|GREATEST|LEAST|OVER|PARTITION|ROW_NUMBER|RANK)/gi

function highlightSql(line: string) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  const re = new RegExp(SQL_KEYWORDS.source, "gi")
  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index))
    }
    parts.push(
      <span key={match.index} className="text-blue-500 dark:text-blue-400">
        {match[0]}
      </span>
    )
    lastIndex = re.lastIndex
  }

  if (lastIndex < line.length) {
    const remaining = line.slice(lastIndex)
    const stringMatch = remaining.match(/'[^']*'/g)
    if (stringMatch) {
      let strIdx = 0
      for (const s of stringMatch) {
        const sPos = remaining.indexOf(s, strIdx)
        if (sPos > strIdx) {
          parts.push(highlightNumeric(remaining.slice(strIdx, sPos)))
        }
        parts.push(
          <span key={`str-${sPos}`} className="text-emerald-600 dark:text-emerald-400">
            {s}
          </span>
        )
        strIdx = sPos + s.length
      }
      if (strIdx < remaining.length) {
        parts.push(highlightNumeric(remaining.slice(strIdx)))
      }
    } else {
      parts.push(highlightNumeric(remaining))
    }
  }

  return parts
}

function highlightNumeric(text: string) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const numRe = /\b(\d+\.?\d*)\b/g
  let match: RegExpExecArray | null

  while ((match = numRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(
      <span key={`num-${match.index}`} className="text-amber-600 dark:text-amber-400">
        {match[0]}
      </span>
    )
    lastIndex = numRe.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : text
}

export { SqlViewer }
export type { SqlViewerProps }
