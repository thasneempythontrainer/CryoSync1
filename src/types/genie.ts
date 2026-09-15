import type { AgentContextMessage } from './agent'

export interface GenieMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sql?: string
  chartData?: Record<string, unknown>[]
  chartType?: 'bar' | 'line' | 'table' | 'pie'
  chartTitle?: string
  tableColumns?: string[]
  tableRows?: Record<string, unknown>[]
  tableTitle?: string
  timestamp: string
}

export interface GenieConversation {
  id: string
  title: string
  mode: 'agent' | 'chat'
  /** Chat-mode display messages, or raw agent context when mode === 'agent'. */
  messages: GenieMessage[] | AgentContextMessage[]
  createdAt: string
  updatedAt: string
}

export interface SuggestedQuestion {
  id: string
  question: string
  category: string
}
