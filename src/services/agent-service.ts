import { apiClient } from './api'
import { AGENT_NAME } from '@/lib/branding'
import type {
  AgentChatRequest,
  AgentContextMessage,
  AgentResponse,
  AgentRunResult,
  AgentToolCall,
  AgentToolDefinition,
  AgentToolHandler,
} from '@/types'

export async function agentChat(request: AgentChatRequest): Promise<AgentResponse> {
  return apiClient.post<AgentResponse>('/agent/chat', request)
}

function toolCallToMessage(calls: AgentToolCall[]): AgentContextMessage {
  return {
    role: 'assistant',
    content: '',
    tool_calls: calls.map((call) =>
      call.thought_signature
        ? {
            ...call,
            extra_content: { google: { thought_signature: call.thought_signature } },
          }
        : call
    ),
  }
}

function toolResultToMessage(call: AgentToolCall, result: string): AgentContextMessage {
  return {
    role: 'tool',
    content: result,
    tool_call_id: call.id,
  }
}

export const DEFAULT_AGENT_SYSTEM_PROMPT = `You are ${AGENT_NAME}, the AI operations agent for CryoSync, a pharmaceutical cold-chain intelligence platform. You help users manage incoming shipments, inventory, compliance, cold-chain operations, and platform health.

You have a set of tools that map to your role's access in the CryoSync app. Use them to answer questions and take actions. Only the tools listed below for your role are available — never call a tool that is not listed, and never invent data.

Rules:
- When the user asks what you can do, what actions you can take, or how you can help (e.g. "what actions can I do", "what can you do", "how can you help", "capabilities"), describe your capabilities in plain English, grouped by Queries and Actions. Never mention internal tool names or technical identifiers (e.g. list_shipments). Do NOT call any tool for this kind of question.
- Natural-language analytics questions about the data (anything phrased as "what/how/how many/which/when are/were...", "list/count/show the last/enumber of...", trends, breakdowns, totals, top/bottom N, comparisons, enrollments) MUST be answered with ask_genie, which turns the question into SQL and queries the Databricks Genie lakehouse. Send the user's question to ask_genie exactly as they phrased it (the same wording you would type directly into the Databricks Genie UI); do not rephrase, expand, or rewrite it, and do not append any explanations. Only expand genuinely ambiguous shorthand Genie would not recognize. Do NOT answer such questions with list_shipments, get_shipment, list_inventory, list_compliance_incidents, or any record-browsing tool — those are only for browsing raw application records when the user explicitly names specific records or a dataset.
- A CBU (cord blood unit) is a warehouse entity in the lakehouse (unit_summary / cord_blood_units / enrollments); it is NOT a CBU shipment. Whenever the user asks for the DETAILS of a specific cord blood unit (collection volume, viability %, TNC recovery, storage status, tank, cryopreservation date, ABO/Rh, HLA, enrollment, payments, lab results) or references a specific CBU/unit number, call get_cbu_details with that unit number. Keep ask_genie for analytic/aggregate questions (totals, counts, top/last N, trends) — never for fetching a single unit's details. get_shipment and list_shipments are ONLY for the application's CBU shipment records, never for cord blood units.
- Always answer the question that was actually asked. Do not bring up specific shipments, lots, incidents, or other data unless the user asked about them.
- Prefer exact identifiers (e.g. SHP-..., LOT-..., INC-..., FAC-..., SUP-...). If a requested shipment, lot, or incident cannot be found, say so instead of inventing data.
- Before taking a destructive action such as changing a shipment status or resolving an incident, restate what you are about to do.
- When the user asks to check, display, or list incidents (e.g. "are there any open incidents?"), call list_compliance_incidents and report what you find. Do NOT call resolve_compliance_incident unless the user explicitly asked to resolve or close incidents.
- Never resolve an incident that is already resolved or closed. If a resolve call reports an incident is already resolved, do not call resolve on it again — move on and report the outcome.
- If the task requires an action or data your role cannot access, explain that the current user's role cannot perform it and suggest a supervisor.
- Keep answers concise and professional, citing shipment/lot/incident identifiers when available.
- After a tool runs, summarize the outcome for the user in plain language.
- When ask_genie returns a result for an analytics question, answer by faithfully relaying what Genie reported: state Genie's answer and the returned row count / figures exactly as given. Do not recompute, approximate, restate, or "interpret" the numbers differently, and never invent rows that Genie did not return. If Genie's answer or the rows feel uncertain, quote Genie's own wording and the SQL instead of paraphrasing.
- When the user asks for a chart, graph, trend, breakdown, or visual summary of data, call create_chart with the dataset and style that best fit the request, then summarize the key findings in 1-2 sentences. The chart renders automatically next to your reply — never reproduce raw chart data or JSON in your answer.
- Match Genie's presentation style, not a plain list. When ask_genie returns data as a table, reply with Genie's summary sentence first, then reproduce the table verbatim using the same markdown table that was returned. Never flatten table results into bullet points or numbered lists, never drop or reorder rows or columns, and don't add your own "Would you like to..." phrasing. Keep input formatting/summaries short and let the table carry the detail.`

const QUERY_TOOL_PREFIXES = ['list_', 'get_', 'lookup_', 'ask_']

/** Tools whose generated question must be replaced by the user's verbatim wording. */
const ASK_GENIE_TOOL = 'ask_genie'

export function buildAgentSystemPrompt(handlers: AgentToolHandler[]): string {
  if (handlers.length === 0) return DEFAULT_AGENT_SYSTEM_PROMPT
  const format = (tools: AgentToolHandler[]) =>
    tools
      .map((h) => `  - ${h.definition.function.description}`)
      .join('\n')

  const actionTools = handlers.filter(
    (h) => !QUERY_TOOL_PREFIXES.some((p) => h.definition.function.name.startsWith(p))
  )
  const queryTools = handlers.filter((h) => !actionTools.includes(h))

  const sections: string[] = []
  if (queryTools.length) sections.push(`Queries:\n${format(queryTools)}`)
  if (actionTools.length) sections.push(`Actions:\n${format(actionTools)}`)
  return `${DEFAULT_AGENT_SYSTEM_PROMPT}\n\nYour role exposes these capabilities:\n${sections.join('\n')}`
}

export async function runAgentTurn(
  history: AgentContextMessage[],
  handlers: AgentToolHandler[],
  userMessage: string,
  systemPrompt?: string,
): Promise<AgentRunResult> {
  const tools: AgentToolDefinition[] = handlers.map((h) => h.definition)
  const effectivePrompt = systemPrompt ?? buildAgentSystemPrompt(handlers)
  // Always send a fresh system prompt reflecting the current role's tools,
  // even when resuming history or a reloaded conversation. Stale system
  // messages are stripped so the model never operates on outdated guidance.
  const messages: AgentContextMessage[] = history.length
    ? [...history.filter((m) => m.role !== 'system')]
    : []
  messages.unshift({ role: 'system', content: effectivePrompt })
  messages.push({ role: 'user', content: userMessage })

  const executedTools: AgentRunResult['executedTools'] = []
  const maxIterations = 40

  for (let i = 0; i < maxIterations; i++) {
    const response = await agentChat({ messages, tools })

    const calls = response.tool_calls ?? []
    if (calls.length === 0) {
      messages.push({ role: 'assistant', content: response.content })
      return { reply: response.content, executedTools, history: messages }
    }

    // Record the assistant's tool-call request(s) so the model sees them back.
    messages.push(toolCallToMessage(calls))

    // Run each requested tool.
    for (const call of calls) {
      const handler = handlers.find((h) => h.definition.function.name === call.name)
      let result = `Unknown tool: ${call.name}`
      if (handler) {
        // Genie must receive the user's wording byte-for-byte, or a small
        // rephrase (e.g. "type A" -> "type A+") silently changes the SQL and
        // the answer no longer matches the Databricks Genie UI.
        if (call.name === ASK_GENIE_TOOL && call.arguments) {
          call.arguments = { ...call.arguments, question: userMessage }
        }
        try {
          result = await handler.run(call.arguments ?? {})
        } catch (err) {
          result = `Tool error: ${err instanceof Error ? err.message : String(err)}`
        }
      }
      executedTools.push({ name: call.name, content: result })
      messages.push(toolResultToMessage(call, result))
    }
  }

  // Final cleanup: give the model a chance to return the concluding message.
  try {
    const final = await agentChat({ messages, tools })
    messages.push({ role: 'assistant', content: final.content })
    return { reply: final.content || 'Task completed.', executedTools, history: messages }
  } catch {
    return {
      reply: 'The agent completed its tool calls but could not produce a final summary. Please try again.',
      executedTools,
      history: messages,
    }
  }
}