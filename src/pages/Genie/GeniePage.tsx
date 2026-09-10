import { useState, useCallback, useRef, useLayoutEffect, useEffect } from "react"
import { Wrench, Menu, X, MessageSquarePlus } from "lucide-react"
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
import {
  updateShipmentStatus,
  updateShipment,
  createShipment,
  getShipmentById,
  getShipments,
  getInventoryLots,
  getInventoryLotById,
  getStorageZones,
  createComplianceIncident,
  getComplianceIncidents,
  getComplianceIncidentById,
  resolveIncident,
  assignIncident,
  getAuditLog,
  getDashboardData,
  getSystemHealth,
  getSystemLogs,
  getFacilities,
  getSuppliers,
  getProducts,
  getUsers,
  scanTemperatureIncidents,
  resolveAllOpenIncidents,
  getCbuDetails,
} from "@/services"

import { useAgentChat, useAuth, useSpeechSynthesis, type AgentStep } from "@/hooks"
import type {
  Shipment,
  GenieMessage,
  AgentContextMessage,
} from "@/types"
import { ChatMessage, stripMarkdownForSpeech } from "@/components/genie/ChatMessage"
import { ChatInput } from "@/components/genie/ChatInput"
import { ConversationSidebar } from "@/components/genie/ConversationSidebar"
import { SuggestedQuestions } from "@/components/genie/SuggestedQuestions"
import { LoadingState } from "@/components/common/LoadingState"
import { Button } from "@/components/ui/button"
import { AgentMark } from "@/components/brand/AgentMark"
import { AGENT_NAME, AGENT_NAV_LABEL } from "@/lib/branding"

function GeniePage() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const queryClient = useQueryClient()
  const prevConversationIdRef = useRef<string | null>(null)

  // Voice mode: when the last input was spoken, the agent's replies are read
  // aloud instead of only rendered as text. Cancel playback whenever the user
  // starts talking or typing so the mic never picks up the agent's voice.
  const { speak, cancel } = useSpeechSynthesis()
  const voiceModeRef = useRef(false)
  const lastSpokenContentRef = useRef("")

  const handleVoiceSent = useCallback(() => {
    voiceModeRef.current = true
  }, [])

  const handleTextSent = useCallback(() => {
    voiceModeRef.current = false
    lastSpokenContentRef.current = ""
    cancel()
  }, [cancel])

  const handleListeningChange = useCallback(
    (listening: boolean) => {
      if (listening) cancel()
    },
    [cancel]
  )

  const {
    data: conversations = [],
    isLoading: isLoadingConversations,
  } = useConversations()

  const { data: activeConversation, isLoading: isLoadingMessages } =
    useConversation(activeConversationId ?? undefined)

  const createConversationMutation = useCreateConversation()
  const deleteConversationMutation = useDeleteConversation()

  const { can, user } = useAuth()

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["shipments"] })
    queryClient.invalidateQueries({ queryKey: ["shipment"] })
    queryClient.invalidateQueries({ queryKey: ["inventory-lots"] })
    queryClient.invalidateQueries({ queryKey: ["storage-zones"] })
    queryClient.invalidateQueries({ queryKey: ["compliance-incidents"] })
    queryClient.invalidateQueries({ queryKey: ["compliance-incident"] })
    queryClient.invalidateQueries({ queryKey: ["dashboard"] })
  }, [queryClient])

  const { steps, isThinking, send, load, reset } = useAgentChat({
    can,
    // Shipments
    updateStatus: async (id: string, status: Shipment["status"]) => {
      await updateShipmentStatus(id, status)
      invalidateAll()
    },
    createShipment: async (data: Partial<Shipment>) => {
      const created = await createShipment(data)
      invalidateAll()
      return created
    },
    updateShipmentDetails: async (id: string, data: Partial<Shipment>) => {
      const updated = await updateShipment(id, data)
      invalidateAll()
      return updated
    },
    lookupShipment: async (id: string) => getShipmentById(id),
    listShipments: async (params) => getShipments(params),
    // Inventory
    lookupInventory: async (params) => getInventoryLots(params),
    getInventoryLot: async (id: string) => getInventoryLotById(id),
    listStorageZones: async (facilityId?: string) => getStorageZones(facilityId),
    // Compliance
    createIncident: async (data) => {
      const created = await createComplianceIncident({
        ...data,
        reportedBy: user?.displayName || "Unknown",
        detectedBy: user?.displayName || undefined,
      })
      invalidateAll()
      return created
    },
    listIncidents: async (params) => getComplianceIncidents(params),
    getIncident: async (id: string) => getComplianceIncidentById(id),
    resolveIncident: async (id, resolution) => {
      const resolved = await resolveIncident(id, resolution)
      invalidateAll()
      return resolved
    },
    assignIncident: async (id, data) => {
      const assigned = await assignIncident(id, data)
      invalidateAll()
      return assigned
    },
    getAuditLog: async (incidentId: string) => getAuditLog(incidentId),
    // Dashboard & system
    getDashboard: async (filters) => getDashboardData(filters),
    getSystemHealth: async () => getSystemHealth(),
    getSystemLogs: async (params) => getSystemLogs(params),
    // Reference data
    listFacilities: async () => getFacilities(),
    listSuppliers: async () => getSuppliers(),
    listProducts: async () => getProducts(),
    listUsers: async () => getUsers(),
    scanTemperatureIncidents: async (facilityId) =>
      scanTemperatureIncidents({ facilityId, reportedBy: user?.displayName || "AI Scanner" }),
    resolveAllOpenIncidents: async (data) =>
      resolveAllOpenIncidents({ ...data, resolvedBy: user?.displayName || "AI Scanner" }),
    askGenie,
    genieThreadId: activeConversationId ?? undefined,
    getCbuDetails,
  })

  // Voice mode: when the last input was spoken, read the agent's replies aloud
  // instead of only rendering them as text.
  useEffect(() => {
    if (!voiceModeRef.current || isThinking) return
    const lastAssistant = [...steps]
      .reverse()
      .find((s) => s.role === "assistant" && s.content.trim())
    if (!lastAssistant?.content) return
    if (lastAssistant.content === lastSpokenContentRef.current) return
    lastSpokenContentRef.current = lastAssistant.content
    speak(stripMarkdownForSpeech(lastAssistant.content))
  }, [steps, isThinking, speak])

  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const allMessages = steps

  // Load the selected conversation's agent context.
  useEffect(() => {
    if (!activeConversation) return
    if (activeConversation.id === prevConversationIdRef.current) return
    prevConversationIdRef.current = activeConversation.id
    // Skip while a turn is in flight so an empty server fetch doesn't wipe
    // the live exchange the user is already seeing.
    if (isThinking) return
    const history = activeConversation.messages as AgentContextMessage[]
    if (history.length === 0 && steps.length > 0) return

    load(history)
  }, [activeConversation, load, isThinking, steps.length])

  useLayoutEffect(() => {
    const el = scrollContainerRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [allMessages])

  const handleSendMessage = useCallback(
    async (message: string) => {
      const trimmed = message.trim()
      if (!trimmed) return

      if (activeConversationId) {
        const result = await send(trimmed)
        if (result) {
          try {
            await saveAgentContext(activeConversationId, result.history)
            queryClient.invalidateQueries({ queryKey: ["genie-conversation", activeConversationId] })
            queryClient.invalidateQueries({ queryKey: ["genie-conversations"] })
          } catch {
            // Persistence failed; the conversation is still usable this session.
          }
        }
        return
      }

      // No conversation yet: show the user message and thinking indicator
      // immediately while the conversation is created in the background.
      const sendPromise = send(trimmed)
      const createdId = await createConversationMutation
        .mutateAsync({
          title: trimmed.substring(0, 60),
          mode: "agent",
        })
        .then((conv) => {
          setActiveConversationId(conv.id)
          return conv.id
        })
        .catch(() => null)

      const result = await sendPromise
      if (createdId && result) {
        try {
          await saveAgentContext(createdId, result.history)
          queryClient.invalidateQueries({ queryKey: ["genie-conversation", createdId] })
          queryClient.invalidateQueries({ queryKey: ["genie-conversations"] })
        } catch {
          // Persistence failed; the conversation is still usable this session.
        }
      }
    },
    [
      send,
      activeConversationId,
      createConversationMutation,
      queryClient,
    ]
  )

  const handleNewConversation = useCallback(() => {
    if (activeConversationId) void resetGenieThread(activeConversationId)
    setActiveConversationId(null)
    reset()
  }, [reset, activeConversationId])

  const handleSelectConversation = useCallback(
    (id: string) => {
      reset()
      prevConversationIdRef.current = null
      setActiveConversationId(id)
    },
    [reset]
  )

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversationMutation.mutate(id)
      void resetGenieThread(id)
      if (id === activeConversationId) {
        setActiveConversationId(null)
        reset()
      }
    },
    [activeConversationId, deleteConversationMutation, reset]
  )

  const handleRegenerate = useCallback(
    (_messageId: string) => {
      const lastUserMsg = steps
        .slice()
        .reverse()
        .find((s) => s.role === "user")
      if (lastUserMsg) void send(lastUserMsg.content)
    },
    [steps, send]
  )

  const handleSuggestedQuestion = useCallback(
    (question: string) => {
      handleSendMessage(question)
    },
    [handleSendMessage]
  )

  const showWelcome = steps.length === 0 && !isLoadingMessages && !isThinking

  const canShipments = can('view:cbus')
  const canUpdateStatus = can('act:update_cbu_status')
  const canCompliance = can('view:compliance')
  const agentQuestions = [
    ...(canUpdateStatus
      ? [
          { id: "q1", question: "start receiving shipment SHP-1001", category: "action" },
        ]
      : []),
    ...(canShipments
      ? [
          { id: "q2", question: "show inventory lots", category: "query" },
          { id: "q3", question: "which shipments arrived today?", category: "query" },
        ]
      : []),
    ...(canCompliance
      ? [
          { id: "q4", question: "list open compliance incidents", category: "query" },
          { id: "q5", question: "get risk overview", category: "query" },
          { id: "q6", question: "scan for temperature incidents", category: "action" },
        ]
      : []),
    { id: "q7", question: "dashboard summary", category: "query" },
  ]

  const inputPlaceholder =
    canShipments && canCompliance
      ? "Try \"release shipment SH-1001\" or \"list open compliance incidents\" or \"resolve incident INC-...\"..."
      : canShipments
        ? "Try \"list vaccine shipments\" or \"create shipment\" or \"show inventory lots\"..."
        : "Try \"list open compliance incidents\" or \"get risk overview\" or \"resolve incident INC-...\"..."

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
                {activeConversation?.title ?? `${AGENT_NAME} Agent`}
              </span>
              <span className="hidden text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70 sm:block">
                AI task agent
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
                    Your AI agent for pharmaceutical cold-chain intelligence.
                    Query and run tasks across shipments, inventory, compliance,
                    and system health, and ask for charts built from live data.
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
                  questions={agentQuestions}
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
                {isLoadingMessages && steps.length === 0 && !isThinking ? (
                  <div className="flex items-center justify-center py-20">
                    <LoadingState variant="spinner" title="Loading messages..." />
                  </div>
                ) : (
                  <>
                    {steps.map((step, i) =>
                      step.role === "tool" ? (
                        <div
                          key={i}
                          title={step.content}
                          className="flex w-fit max-w-full items-center gap-2 self-center rounded-full border border-border/40 bg-muted/40 px-3.5 py-1.5"
                        >
                          <Wrench className="size-3.5 shrink-0 text-primary" />
                          <span className="truncate text-xs font-medium text-foreground">
                            {step.toolName}
                          </span>
                          <span className="shrink-0 text-[11px] font-medium text-success">
                            done
                          </span>
                        </div>
                      ) : (
                        <ChatMessage
                          key={i}
                          message={stepAsMessage(step)}
                          onRegenerate={handleRegenerate}
                        />
                      )
                    )}
                    {isThinking && <ThinkingIndicator />}
                  </>
                )}
              </div>
            </div>

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
          {AGENT_NAME} is thinking...
        </span>
      </div>
    </div>
  )
}

function stepAsMessage(step: AgentStep): GenieMessage {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: step.role === "user" ? "user" : "assistant",
    content: step.content,
    chartData: step.chartData,
    chartType: step.chartType,
    chartTitle: step.chartTitle,
    timestamp: new Date().toISOString(),
  }
}

export default GeniePage
