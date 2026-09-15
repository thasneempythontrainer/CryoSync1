import { useCallback, useMemo, useRef, useState } from 'react'
import type { AgentContextMessage, AgentRunResult } from '@/types'
import { runAgentTurn } from '@/services/agent-service'
import {
  allAgentTools,
  AGENT_CHART_TOOL,
  parseChartToolResult,
  type AgentToolsDeps,
  type AgentChartPayload,
} from '@/services/agent-tools'

export interface AgentStep {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolName?: string
  chartData?: Record<string, unknown>[]
  chartType?: 'bar' | 'line' | 'pie' | 'table'
  chartTitle?: string
  tableColumns?: string[]
  tableRows?: Record<string, unknown>[]
  tableTitle?: string
}

export function agentContextToSteps(history: AgentContextMessage[]): AgentStep[] {
  const steps: AgentStep[] = []
  const toolNames = new Map<string, string>()
  let pendingChart: AgentChartPayload | undefined
  let pendingTable: { columns: string[]; data: Record<string, unknown>[]; title: string } | undefined

  for (const m of history) {
    if (m.role === 'system') continue

    if (m.role === 'user') {
      steps.push({ role: 'user', content: m.content })
      continue
    }

    if (m.role === 'assistant') {
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) toolNames.set(tc.id, tc.name)
        continue
      }
      if (m.content) {
        const step: AgentStep = {
          role: 'assistant',
          content: m.content.replace(/\n*____GENIE_TABLE____\{.*\}\s*$/, ''),
        }
        if (pendingChart) {
          step.chartData = pendingChart.chartData
          step.chartType = pendingChart.chartType
          step.chartTitle = pendingChart.title
          pendingChart = undefined
        }
        if (pendingTable) {
          step.tableColumns = pendingTable.columns
          step.tableRows = pendingTable.data
          step.tableTitle = pendingTable.title
          pendingTable = undefined
        }
        steps.push(step)
      }
      continue
    }

    if (m.role === 'tool') {
      const name = m.tool_call_id ? toolNames.get(m.tool_call_id) : undefined
      if (name === AGENT_CHART_TOOL) {
        const chart = parseChartToolResult(m.content)
        if (chart) pendingChart = chart
        continue
      }
      if (name === 'ask_genie') {
        const envelope = m.content.match(/____GENIE_TABLE____(\{.*\})\s*$/)
        if (envelope) {
          try {
            const parsed = JSON.parse(envelope[1]) as { columns?: string[]; data?: Record<string, unknown>[]; answer?: string }
            if (parsed.columns && parsed.data) {
              pendingTable = {
                columns: parsed.columns,
                data: parsed.data,
                title: parsed.answer?.split('\n')[0]?.replace(/^[\s*#]+/, '')?.slice(0, 80) || 'Cord Blood Unit Results',
              }
            }
          } catch { /* malformed envelope, ignore */ }
        }
        // Skip pushing a raw tool step – it's not rendered in the chat.
        continue
      }
      steps.push({
        role: 'tool',
        content: m.content,
        toolName: name,
      })
      continue
    }
  }

  return steps
}

export function useAgentChat(deps: AgentToolsDeps) {
  const [steps, setSteps] = useState<AgentStep[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const historyRef = useRef<AgentContextMessage[]>([])
  // Bumped whenever history is replaced (load/reset) so results from an
  // in-flight turn on a different conversation are discarded instead of
  // clobbering the active one.
  const generationRef = useRef(0)
  const turnInFlightRef = useRef(false)

  const handlers = useMemo(() => allAgentTools(deps), [deps])

  const send = useCallback(
    async (message: string): Promise<AgentRunResult | undefined> => {
      const trimmed = message.trim()
      if (!trimmed) return undefined

      // Only one agent turn at a time. A duplicate send (e.g. a double-fired
      // voice event) would otherwise race and overwrite the shared history,
      // losing the conversation context mid-turn.
      if (turnInFlightRef.current) return undefined

      turnInFlightRef.current = true
      const generation = generationRef.current
      setSteps((prev) => [...prev, { role: 'user', content: trimmed }])
      setIsThinking(true)

      try {
        const result = await runAgentTurn(historyRef.current, handlers, trimmed)
        if (generation !== generationRef.current) return undefined
        historyRef.current = result.history
        setSteps(agentContextToSteps(result.history))
        return result
      } catch (err) {
        if (generation !== generationRef.current) return undefined
        setSteps((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              err instanceof Error
                ? err.message
                : 'The agent is temporarily unavailable. Please try again.',
          },
        ])
        return undefined
      } finally {
        turnInFlightRef.current = false
        if (generation === generationRef.current) setIsThinking(false)
      }
    },
    [handlers]
  )

  const load = useCallback((history: AgentContextMessage[]) => {
    generationRef.current += 1
    turnInFlightRef.current = false
    historyRef.current = [...history]
    setSteps(agentContextToSteps(history))
  }, [])

  const reset = useCallback(() => {
    generationRef.current += 1
    turnInFlightRef.current = false
    historyRef.current = []
    setSteps([])
  }, [])

  return { steps, isThinking, send, load, reset }
}
