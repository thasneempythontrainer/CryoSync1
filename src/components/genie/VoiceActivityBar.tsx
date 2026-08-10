import { useEffect, useRef, useState } from "react"
import { AudioLines, CircleAlert } from "lucide-react"

import { cn } from "@/lib/utils"

const BAR_COUNT = 36

const BAR_SEEDS: number[] = Array.from({ length: BAR_COUNT }, (_, i) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
})

interface VoiceActivityBarProps {
  active: boolean
  transcript?: string
}

function VoiceActivityBar({ active, transcript = "" }: VoiceActivityBarProps) {
  const [level, setLevel] = useState(0)
  const [speaking, setSpeaking] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef(0)
  const speakFramesRef = useRef(0)

  useEffect(() => {
    if (!active) {
      setLevel(0)
      setSpeaking(false)
      setReady(false)
      setError(null)
      return
    }

    let cancelled = false
    let retries = 0

    const teardown = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      analyserRef.current?.disconnect()
      analyserRef.current = null
      if (audioCtxRef.current) void audioCtxRef.current.close()
      audioCtxRef.current = null
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new Ctx()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.6
        source.connect(analyser)
        audioCtxRef.current = ctx
        analyserRef.current = analyser
        setReady(true)
        setError(null)

        const data = new Uint8Array(analyser.fftSize)

        const tick = () => {
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / data.length)
          const normalized = Math.min(1, rms * 4)
          setLevel(normalized)

          if (normalized > 0.06) {
            speakFramesRef.current = Math.min(speakFramesRef.current + 1, 6)
          } else {
            speakFramesRef.current = Math.max(speakFramesRef.current - 1, 0)
          }
          setSpeaking(speakFramesRef.current >= 3)
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      } catch (e) {
        if (cancelled) return
        const name =
          e && typeof e === "object" && "name" in e ? (e as { name?: string }).name : undefined
        if (name === "NotAllowedError" || name === "SecurityError") {
          setError("Microphone access was denied")
        } else if (retries < 2) {
          retries += 1
          window.setTimeout(() => void start(), 500)
        } else {
          setError("Microphone unavailable")
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      teardown()
      setReady(false)
      setLevel(0)
      setSpeaking(false)
    }
  }, [active])

  if (!active) return null

  return (
    <div className="w-full rounded-xl border border-border/60 bg-card px-3 py-2 shadow-xs">
      <div className="flex items-center gap-1.5">
        <AudioLines
          className={cn(
            "size-3.5 transition-colors",
            speaking ? "text-primary" : error ? "text-destructive" : "text-muted-foreground"
          )}
        />
        {error ? (
          <span className="flex items-center gap-1 text-xs font-medium text-destructive">
            <CircleAlert className="size-3" />
            {error}
          </span>
        ) : (
          <span
            className={cn(
              "text-xs font-medium",
              speaking ? "text-primary" : "text-muted-foreground"
            )}
          >
            {speaking ? "Voice detected" : "Listening…"}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 animate-pulse rounded-full",
              speaking ? "bg-primary" : error ? "bg-destructive" : "bg-muted-foreground/40"
            )}
          />
          <span className="text-[11px] text-muted-foreground/70">
            {speaking ? "speaking" : ready ? "live" : "starting"}
          </span>
        </span>
      </div>

      <div className="mt-2 flex h-8 items-end gap-[3px]">
        {BAR_SEEDS.map((seed, i) => {
          const height = error
            ? 3
            : 4 + level * (8 + seed * 18) + (speaking ? 4 : 0)
          return (
            <span
              key={i}
              style={{ height: `${Math.min(height, 32)}px` }}
              className={cn(
                "w-full flex-1 rounded-full transition-all duration-75 ease-linear",
                error
                  ? "bg-muted-foreground/20"
                  : speaking
                    ? "bg-primary"
                    : "bg-foreground/40"
              )}
            />
          )
        })}
      </div>

      {transcript.trim() && (
        <p className="mt-1.5 truncate text-xs italic text-muted-foreground">
          &ldquo;{transcript.trim()}&rdquo;
        </p>
      )}
    </div>
  )
}

export { VoiceActivityBar }
export type { VoiceActivityBarProps }
