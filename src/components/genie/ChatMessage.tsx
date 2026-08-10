import { useState, useCallback } from "react"
import { motion } from "framer-motion"
import { Bot, Copy, Check, RefreshCw, User, Volume2, VolumeX } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  LabelList,
  Legend,
} from "recharts"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SqlViewer } from "@/components/genie/SqlViewer"
import { useSpeechSynthesis } from "@/hooks"
import type { GenieMessage as GenieMessageType } from "@/types"

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

const LABEL_COLOR = "var(--muted-foreground)"

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatValue(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return String(value ?? "")
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

function truncateLabel(label: string, max = 18): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

interface ChatMessageProps {
  message: GenieMessageType
  onRegenerate?: (messageId: string) => void
}

function ChatMessage({ message, onRegenerate }: ChatMessageProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === "user"
  const { isSpeaking, isPaused, speak, cancel: _cancel, pause, resume, isSupported } =
    useSpeechSynthesis()

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [message.content])

  const handleSpeak = useCallback(() => {
    if (isSpeaking) {
      if (isPaused) {
        resume()
      } else {
        pause()
      }
    } else {
      speak(stripMarkdownForSpeech(message.content))
    }
  }, [isSpeaking, isPaused, resume, pause, speak, message.content])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
      className={cn(
        "flex w-full gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <Avatar
        size={isUser ? "sm" : "default"}
        className={cn(
          "mt-0.5 shrink-0",
          isUser && "bg-primary text-primary-foreground"
        )}
      >
        <AvatarFallback>
          {isUser ? (
            <User className="size-4" />
          ) : (
            <Bot className="size-4" />
          )}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "group relative flex max-w-[75%] flex-col gap-1.5",
          isUser && "items-end"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-md"
              : "bg-secondary text-secondary-foreground rounded-tl-md"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <FormattedContent content={message.content} />
          )}

          {!isUser && message.sql && (
            <SqlViewer sql={message.sql} />
          )}

          {!isUser && message.chartData && message.chartType && (
            <div className="mt-3 overflow-hidden rounded-lg border border-border/40 bg-background">
              {message.chartTitle && (
                <div className="border-b border-border/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
                  {message.chartTitle}
                </div>
              )}
              <ChartRenderer
                data={message.chartData}
                chartType={message.chartType}
              />
            </div>
          )}
        </div>

        <div
          className={cn(
            "flex items-center gap-1 px-2",
            isUser ? "flex-row" : "flex-row-reverse"
          )}
        >
          <span className="text-[10px] text-muted-foreground/50">
            {formatTimestamp(message.timestamp)}
          </span>

          <div
            className={cn(
              "flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100",
              isUser ? "flex-row" : "flex-row-reverse"
            )}
          >
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleCopy}
              className="text-muted-foreground/40 hover:text-muted-foreground"
            >
              {copied ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
            </Button>

            {!isUser && onRegenerate && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onRegenerate(message.id)}
                className="text-muted-foreground/40 hover:text-muted-foreground"
              >
                <RefreshCw className="size-3" />
              </Button>
            )}

            {!isUser && isSupported && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleSpeak}
                title={isSpeaking ? (isPaused ? "Resume" : "Pause") : "Read aloud"}
                className="text-muted-foreground/40 hover:text-muted-foreground"
              >
                {isSpeaking && !isPaused ? (
                  <Volume2 className="size-3" />
                ) : (
                  <VolumeX className="size-3" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/[>_]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export { stripMarkdownForSpeech }

function FormattedContent({ content }: { content: string }) {
  const lines = content.split("\n")
  const elements: React.ReactNode[] = []
  let inList = false

  lines.forEach((line, i) => {
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const text = line.slice(2)
      if (!inList) {
        inList = true
        elements.push(
          <ul key={`ul-${i}`} className="my-1.5 list-disc pl-4 space-y-1">
            <li key={i}>{parseInline(text)}</li>
          </ul>
        )
      } else {
        const lastEl = elements[elements.length - 1]
        elements[elements.length - 1] = (
          <ul key={`ul-${i}`} className="my-1.5 list-disc pl-4 space-y-1">
            {(lastEl as React.ReactElement<{ children: React.ReactNode }>)?.props?.children ?? null}
            <li key={i}>{parseInline(text)}</li>
          </ul>
        )
      }
    } else if (line.match(/^\d+\.\s/)) {
      const text = line.replace(/^\d+\.\s/, "")
      elements.push(
        <p key={i} className="my-1 flex gap-2">
          <span className="shrink-0 text-muted-foreground/60">
            {line.match(/^\d+/)?.[0]}.
          </span>
          <span>{parseInline(text)}</span>
        </p>
      )
      inList = false
    } else if (line.trim() === "") {
      elements.push(<div key={`br-${i}`} className="h-1" />)
      inList = false
    } else {
      elements.push(
        <p key={i} className="my-0.5">
          {parseInline(line)}
        </p>
      )
      inList = false
    }
  })

  return <div className="space-y-0.5">{elements}</div>
}

function parseInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(
        <strong key={`b-${match.index}`} className="font-semibold">
          {match[2]}
        </strong>
      )
    } else if (match[3]) {
      parts.push(
        <code
          key={`c-${match.index}`}
          className="rounded bg-muted/80 px-1 py-0.5 text-[12px] font-mono"
        >
          {match[3]}
        </code>
      )
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : text
}

interface ChartRendererProps {
  data: Record<string, unknown>[]
  chartType: "bar" | "line" | "table" | "pie"
}

function ChartRenderer({ data, chartType }: ChartRendererProps) {
  if (!data || data.length === 0) return null

  const keys = Object.keys(data[0])
  const nameKey = keys[0]
  const valueKey = keys[1] || keys[0]
  const secondaryKey = keys[2]

  if (chartType === "table") {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/40">
              {keys.map((key) => (
                <th
                  key={key}
                  className="px-3 py-1.5 text-left font-medium text-muted-foreground capitalize"
                >
                  {key.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={i}
                className="border-b border-border/20 last:border-0 hover:bg-muted/30"
              >
                {keys.map((key) => (
                  <td key={key} className="px-3 py-1.5">
                    {String(row[key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (chartType === "pie") {
    return (
      <div className="flex items-center justify-center py-2">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data as { name?: string; value?: number }[]}
              dataKey={valueKey}
              nameKey={nameKey}
              cx="50%"
              cy="50%"
              outerRadius={70}
              innerRadius={40}
            >
              {data.map((_, idx) => (
                <Cell
                  key={idx}
                  fill={CHART_COLORS[idx % CHART_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatValue(value)}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid var(--border)",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              iconSize={8}
              formatter={(value) => truncateLabel(humanizeKey(String(value)), 24)}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const crowded = data.length > 8
  const tickInterval = Math.max(0, Math.ceil(data.length / 12) - 1)
  const showBarLabels = chartType === "bar" && data.length <= 12
  const height = chartType === "line" ? (crowded ? 260 : 220) : crowded ? 300 : 220

  const barTick = crowded
    ? { fontSize: 10, angle: -35, textAnchor: "end" as const }
    : { fontSize: 11 }

  const xAxisProps = {
    tick:
      chartType === "bar"
        ? barTick
        : crowded
          ? { fontSize: 10 }
          : { fontSize: 11 },
    interval: tickInterval,
    height: chartType === "bar" && crowded ? 52 : 30,
    stroke: "var(--muted-foreground)",
    tickLine: false,
    tickFormatter: (value: unknown) => truncateLabel(String(value)),
  }

  const tooltipProps = {
    contentStyle: {
      fontSize: 12,
      borderRadius: 8,
      border: "1px solid var(--border)",
    },
    formatter: (value: unknown, name: unknown) => [
      formatValue(value),
      humanizeKey(String(name)),
    ],
  }

  const legendProps = {
    wrapperStyle: { fontSize: 11 },
    iconSize: 8,
    formatter: (value: unknown) => humanizeKey(String(value)),
  }

  return (
    <div className="py-2">
      <ResponsiveContainer width="100%" height={height}>
        {chartType === "line" ? (
          <LineChart data={data as Record<string, string | number>[]}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey={nameKey} {...xAxisProps} />
            <YAxis
              width={44}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatValue}
            />
            <Tooltip {...tooltipProps} />
            {secondaryKey && <Legend {...legendProps} />}
            <Line
              type="monotone"
              dataKey={valueKey}
              stroke={CHART_COLORS[0]}
              strokeWidth={2}
              dot={{ r: 3, fill: CHART_COLORS[0] }}
            />
            {secondaryKey && (
              <Line
                type="monotone"
                dataKey={secondaryKey}
                stroke={CHART_COLORS[1]}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS[1] }}
              />
            )}
          </LineChart>
        ) : (
          <BarChart data={data as Record<string, string | number>[]}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey={nameKey} {...xAxisProps} />
            <YAxis
              width={44}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatValue}
            />
            <Tooltip {...tooltipProps} />
            {secondaryKey && <Legend {...legendProps} />}
            {secondaryKey ? (
              <>
                <Bar dataKey={valueKey} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]}>
                  {showBarLabels && (
                    <LabelList
                      dataKey={valueKey}
                      position="top"
                      offset={6}
                      fontSize={10}
                      fill={CHART_COLORS[0]}
                      formatter={formatValue}
                    />
                  )}
                </Bar>
                <Bar dataKey={secondaryKey} fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]}>
                  {showBarLabels && (
                    <LabelList
                      dataKey={secondaryKey}
                      position="top"
                      offset={6}
                      fontSize={10}
                      fill={CHART_COLORS[1]}
                      formatter={formatValue}
                    />
                  )}
                </Bar>
              </>
            ) : (
              <Bar dataKey={valueKey} radius={[4, 4, 0, 0]}>
                {data.map((_, idx) => (
                  <Cell
                    key={idx}
                    fill={CHART_COLORS[idx % CHART_COLORS.length]}
                  />
                ))}
                {showBarLabels && (
                  <LabelList
                    dataKey={valueKey}
                    position="top"
                    offset={6}
                    fontSize={10}
                    fill={LABEL_COLOR}
                    formatter={formatValue}
                  />
                )}
              </Bar>
            )}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export { ChatMessage }
export type { ChatMessageProps }
