import { useState, useRef, useEffect, useCallback } from "react"
import { Send, Loader2, Mic, MicOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { VoiceActivityBar } from "@/components/genie/VoiceActivityBar"
import { useSpeechRecognition } from "@/hooks"

interface ChatInputProps {
  onSend: (message: string) => void
  onVoiceSent?: () => void
  onTextSent?: () => void
  onListeningChange?: (listening: boolean) => void
  isLoading?: boolean
  disabled?: boolean
  placeholder?: string
}

function ChatInput({
  onSend,
  onVoiceSent,
  onTextSent,
  onListeningChange,
  isLoading = false,
  disabled = false,
  placeholder = "Ask a message about your cold-chain data...",
}: ChatInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || isLoading || disabled) return
    onTextSent?.()
    onSend(trimmed)
    setValue("")
  }, [value, isLoading, disabled, onSend, onTextSent])

  const {
    isListening,
    isSupported: isVoiceSupported,
    transcript,
    startListening,
    stopListening,
  } = useSpeechRecognition({
    onEnd: (finalText) => {
      const trimmed = finalText.trim()
      if (!trimmed || isLoading || disabled) return
      setValue("")
      onVoiceSent?.()
      onSend(trimmed)
    },
  })

  const handleToggleVoice = useCallback(() => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }, [isListening, startListening, stopListening])

  useEffect(() => {
    onListeningChange?.(isListening)
  }, [isListening, onListeningChange])

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = "auto"
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    }
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <div className="flex flex-col gap-2">
      {isListening && (
        <VoiceActivityBar active={isListening} transcript={transcript} />
      )}
      <div className="relative flex items-end gap-2 rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-sm transition-colors focus-within:border-ring/50 focus-within:ring-1 focus-within:ring-ring/20">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isLoading}
        rows={1}
        className={cn(
          "max-h-[200px] min-h-[24px] w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={!value.trim() || isLoading || disabled}
        className="mb-0.5 shrink-0 rounded-full"
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
      </Button>
      {isVoiceSupported && (
        <Button
          size="icon"
          variant={isListening ? "default" : "ghost"}
          onClick={handleToggleVoice}
          disabled={disabled || isLoading}
          title={isListening ? "Stop voice input" : "Use voice input"}
          className={cn(
            "mb-0.5 shrink-0 rounded-full",
            isListening && "animate-pulse"
          )}
        >
          {isListening ? (
            <Mic className="size-4" />
          ) : (
            <MicOff className="size-4" />
          )}
        </Button>
      )}
      </div>
    </div>
  )
}

export { ChatInput }
export type { ChatInputProps }
