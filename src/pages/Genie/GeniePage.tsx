import { useState, useCallback, useRef, useLayoutEffect, useEffect } from "react"
import { Menu, X, MessageSquarePlus } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"

import {
  useConversations,
  useConversation,
  useCreateConversation,
  useDeleteConversation,
  saveAgentContext,
  askGenie,
  resetGenieThread,
} from "@/services"

import { useAuth, useSpeechSynthesis } from "@/hooks"
import type { GenieMessage, AgentContextMessage } from "@/types"
import { ChatMessage, stripMarkdownForSpeech } from "@/components/genie/ChatMessage"
import { ChatInput } from "@/components/genie/ChatInput"
import { ConversationSidebar } from "@/components/genie/ConversationSidebar"
import { SuggestedQuestions } from "@/components/genie/SuggestedQuestions"
import { LoadingState } from "@/components/common/LoadingState"
import { Button } from "@/components/ui/button"
import { AgentMark } from "@/components/brand/AgentMark"
import { AGENT_NAME, AGENT_NAV_LABEL } from "@/lib/branding"
import type { GenieAskResult } from "@/services/genie-service"

// ── helpers ──────────────────────────────────────────────────────────────────

function genieResultToMessage(result: GenieAskResult): GenieMessage {
  return {
    id: `genie-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "assistant",
    content: result.answer,
    sql: result.sql || undefined,
    tableColumns: result.columns.length > 0 ? result.columns : undefined,
    tableRows: result.data.length > 0 ? result.data : undefined,
    timestamp: new Date().toISOString(),
  }
}

function suggestedQuestionsFromResult(result: GenieAskResult) {
  return result.suggestedQuestions.slice(0, 6).map((q, i) => ({
    id: `sq-${i}`,
    question: q,
    category: "Query",
  }))
}

// ── static suggested questions shown on the welcome screen ───────────────────

const STATIC_QUESTIONS = [
  { id: "q1", question: "which CBU shipments arrived today?", category: "Operations" },
  { id: "q2", question: "how many cord blood units are in storage vs testing?", category: "Inventory" },
  { id: "q3", question: "list cord blood units currently in quarantine", category: "Inventory" },
  { id: "q4", question: "list open temperature excursion incidents", category: "Quality" },
  { id: "q5", question: "show quality events by severity", category: "Quality" },
  { id: "q6", question: "get cold chain risk overview", category: "Compliance" },
]

// ── component ────────────────────────────────────────────────────────────────

function GeniePage() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<GenieMessage[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [dynamicQuestions, setDynamicQuestions] = useState<
    { id: string; question: string; category: string }[]
  >([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const queryClient = useQueryClient()
  const prevConversationIdRef = useRef<string | null>(null)

  // Voice mode
  const { speak, cancel } = useSpeechSynthesis()
  const voiceModeRef = useRef(false)
  const lastSpokenContentRef = useRef("")

  const handleVoiceSent = useCallback(() => { voiceModeRef.current = true }, [])
  const handleTextSent = useCallback(() => {
    voiceModeRef.current = false
    lastSpokenContentRef.current = ""
    cancel()
  }, [cancel])
  const handleListeningChange = useCallback((listening: boolean) => {
    if (listening) cancel()
  }, [cancel])

  // Conversations
  const { data: conversations = [], isLoading: isLoadingConversations } = useConversations()
  const { data: activeConversation, isLoading: isLoadingMessages } =
    useConversation(activeConversationId ?? undefined)
  const createConversationMutation = useCreateConversation()
  const deleteConversationMutation = useDeleteConversation()
  const { can } = useAuth()

  // Voice: read latest assistant reply aloud
  useEffect(() => {
    if (!voiceModeRef.current || isThinking) return
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim())
    if (!lastAssistant?.content) return
    if (lastAssistant.content === lastSpokenContentRef.current) return
    lastSpokenContentRef.current = lastAssistant.content
    speak(stripMarkdownForSpeech(lastAssistant.content))
  }, [messages, isThinking, speak])

  // Load conversation messages
  useEffect(() => {
    if (!activeConversation) return
    if (activeConversation.id === prevConversationIdRef.current) return
    prevConversationIdRef.current = activeConversation.id
    if (isThinking) return
    const stored = activeConversation.messages as GenieMessage[]
    if (Array.isArray(stored) && stored.length > 0) {
      setMessages(stored)
    } else {
      setMessages([])
    }
    setDynamicQuestions([])
  }, [activeConversation, isThinking])

  // Scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight })
  }, [messages, isThinking])

  // ── send ─────────────────────────────────────────────────────────────────

  const handleSendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      // Optimistic user message
      const userMsg: GenieMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsThinking(true)
      setDynamicQuestions([])

      try {
        const result = await askGenie(trimmed, activeConversationId ?? undefined)
        const assistantMsg = genieResultToMessage(result)
        const updatedMessages = [...messages, userMsg, assistantMsg]
        setMessages(updatedMessages)
        setDynamicQuestions(suggestedQuestionsFromResult(result))

        // Ensure a conversation exists, then persist the full thread
        let convId = activeConversationId
        if (!convId) {
          try {
            const conv = await createConversationMutation.mutateAsync({
              title: trimmed.substring(0, 60),
              mode: "agent",
            })
            convId = conv.id
            // Lock the ref immediately so the load-effect doesn't overwrite
            // our optimistic messages with the (still-empty) server snapshot.
            prevConversationIdRef.current = convId
            setActiveConversationId(convId)
          } catch {
            // persistence failed, still usable this session
          }
        }

        if (convId) {
          saveAgentContext(convId, updatedMessages as unknown as AgentContextMessage[]).catch(() => {})
          queryClient.invalidateQueries({ queryKey: ["genie-conversation", convId] })
          queryClient.invalidateQueries({ queryKey: ["genie-conversations"] })
        }
      } catch (err) {
        const errorMsg: GenieMessage = {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Sorry, Genie could not answer that: ${err instanceof Error ? err.message : "unknown error"}. Please try rephrasing your question.`,
          timestamp: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, errorMsg])
      } finally {
        setIsThinking(false)
      }
    },
    [activeConversationId, createConversationMutation, queryClient],
  )

  // ── conversation management ─────────────────────────────────────────────

  const handleNewConversation = useCallback(() => {
    if (activeConversationId) void resetGenieThread(activeConversationId)
    setActiveConversationId(null)
    setMessages([])
    setDynamicQuestions([])
  }, [activeConversationId])

  const handleSelectConversation = useCallback((id: string) => {
    prevConversationIdRef.current = null
    setActiveConversationId(id)
    setDynamicQuestions([])
  }, [])

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversationMutation.mutate(id)
      void resetGenieThread(id)
      if (id === activeConversationId) {
        setActiveConversationId(null)
        setMessages([])
        setDynamicQuestions([])
      }
    },
    [activeConversationId, deleteConversationMutation],
  )

  const handleRegenerate = useCallback(
    (_messageId: string) => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user")
      if (lastUser) void handleSendMessage(lastUser.content)
    },
    [messages, handleSendMessage],
  )

  const handleSuggestedQuestion = useCallback(
    (question: string) => handleSendMessage(question),
    [handleSendMessage],
  )

  // ── UI state ────────────────────────────────────────────────────────────

  const showWelcome = messages.length === 0 && !isLoadingMessages && !isThinking
  const displayQuestions = dynamicQuestions.length > 0 ? dynamicQuestions : STATIC_QUESTIONS

  const canShipments = can("view:cbus")
  const canCompliance = can("view:compliance")
  const inputPlaceholder =
    canShipments && canCompliance
      ? "Ask Genie anything about your cord blood cold chain..."
      : canShipments
        ? "Ask Genie about shipments, inventory, and CBUs..."
        : canCompliance
          ? "Ask Genie about compliance, excursions, and risk..."
          : "Ask Genie a question..."

  return (
    <div className="flex h-full w-full bg-transparent">
      <ConversationSidebar
        conversations={conversations.filter((c) => c.mode === "agent")}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
        isLoading={isLoadingConversations}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-background/75 px-3 backdrop-blur-xl sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Toggle conversations"
              onClick={() => setSidebarOpen((open) => !open)}
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            >
              {sidebarOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <AgentMark className="size-5" />
            </div>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold text-foreground">
                {activeConversation?.title ?? `${AGENT_NAME} Data Assistant`}
              </span>
              <span className="hidden text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70 sm:block">
                Powered by Databricks Genie
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNewConversation}
              title="New conversation"
              aria-label="New conversation"
              className="text-muted-foreground hover:text-foreground"
            >
              <MessageSquarePlus className="size-5" />
            </Button>
          </div>
        </div>

        {showWelcome ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-6 px-4 py-8 sm:px-6 sm:py-10">
              <div className="relative flex flex-col items-center gap-4 text-center">
                <div className="flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <AgentMark className="size-10" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {AGENT_NAV_LABEL}
                  </h1>
                  <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                    Ask questions directly against your Databricks Genie lakehouse.
                    No intermediaries — your question goes straight to the data.
                  </p>
                </div>
              </div>

              <div className="w-full">
                <ChatInput
                  onSend={handleSendMessage}
                  onVoiceSent={handleVoiceSent}
                  onTextSent={handleTextSent}
                  onListeningChange={handleListeningChange}
                  isLoading={isThinking}
                  placeholder={inputPlaceholder}
                />
              </div>

              <div className="w-full">
                <SuggestedQuestions
                  questions={displayQuestions}
                  onSelect={handleSuggestedQuestion}
                  isLoading={false}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div
              ref={scrollContainerRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4"
            >
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-6">
                {isLoadingMessages && messages.length === 0 && !isThinking ? (
                  <div className="flex items-center justify-center py-20">
                    <LoadingState variant="spinner" title="Loading messages..." />
                  </div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <ChatMessage
                        key={msg.id}
                        message={msg}
                        onRegenerate={handleRegenerate}
                      />
                    ))}
                    {isThinking && <ThinkingIndicator />}
                    {dynamicQuestions.length > 0 && (
                      <div className="mt-2">
                        <SuggestedQuestions
                          questions={dynamicQuestions}
                          onSelect={handleSuggestedQuestion}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* dynamic suggested questions now render inline after messages */}

            <div className="shrink-0 border-t border-border/40 bg-background/80 px-3 py-3 backdrop-blur-xl sm:px-4">
              <div className="mx-auto w-full max-w-3xl">
                <ChatInput
                  onSend={handleSendMessage}
                  onVoiceSent={handleVoiceSent}
                  onTextSent={handleTextSent}
                  onListeningChange={handleListeningChange}
                  isLoading={isThinking}
                  placeholder={inputPlaceholder}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── thinking indicator ───────────────────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2.5 pl-1">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary ring-1 ring-border">
        <AgentMark className="size-4" />
      </div>
      <div className="flex items-center gap-2 rounded-full border border-border/40 bg-muted/40 px-3 py-1.5">
        <span className="size-1.5 animate-bounce rounded-full bg-primary/60" />
        <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0.1s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0.2s]" />
        <span className="text-xs font-medium text-muted-foreground">
          Querying Genie...
        </span>
      </div>
    </div>
  )
}

export default GeniePage
