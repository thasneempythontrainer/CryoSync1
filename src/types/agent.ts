export type AgentRole = 'user' | 'assistant' | 'tool' | 'system'

export interface AgentToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  /** Required by Gemini 3 thinking models to echo back on assistant round trips. */
  thought_signature?: string
  /** Wire format used when sending the call back to the OpenAI-compatible API. */
  extra_content?: { google?: { thought_signature?: string } }
}

export interface AgentToolParameterSchema {
  type: string
  description?: string
  enum?: string[]
  items?: AgentToolParameterSchema
  properties?: Record<string, AgentToolParameterSchema>
}

export interface AgentToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, AgentToolParameterSchema>
      required?: string[]
    }
  }
}

export interface AgentContextMessage {
  role: AgentRole
  content: string
  tool_call_id?: string
  tool_calls?: AgentToolCall[]
}

export interface AgentResponse {
  content: string
  tool_calls?: AgentToolCall[]
}

export interface AgentChatRequest {
  messages: AgentContextMessage[]
  tools: AgentToolDefinition[]
}

export interface AgentRunResult {
  reply: string
  executedTools: { name: string; content: string }[]
  history: AgentContextMessage[]
}

export interface AgentToolHandler {
  definition: AgentToolDefinition
  run: (args: Record<string, unknown>) => Promise<string>
}