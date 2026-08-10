import { useCallback, useEffect, useRef, useState } from "react"

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: {
    length: number
    [index: number]: {
      isFinal: boolean
      [index: number]: { transcript: string }
    }
  }
}

interface UseSpeechRecognitionOptions {
  lang?: string
  continuous?: boolean
  stopTimeout?: number
  /**
   * A session that ends sooner than this (with no speech captured) is treated
   * as Chrome dropping the mic prematurely and is restarted automatically.
   */
  restartThresholdMs?: number
  /** Upper bound on automatic restarts per listening session. */
  maxRestarts?: number
  /** Called continuously with the live (interim) transcript for display. */
  onInterim?: (transcript: string) => void
  /** Called once with the full captured utterance when listening ends. */
  onEnd?: (transcript: string) => void
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const {
    lang = "en-US",
    continuous = true,
    stopTimeout = 3000,
    restartThresholdMs = 4000,
    maxRestarts = 3,
    onInterim,
    onEnd,
  } = options

  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [transcript, setTranscriptState] = useState("")

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onInterimRef = useRef(onInterim)
  const onEndRef = useRef(onEnd)

  const transcriptRef = useRef("")
  const finalTextRef = useRef("")
  const lastActivityRef = useRef(0)
  const listeningRef = useRef(false)
  const deliveredRef = useRef(false)
  const startedAtRef = useRef(0)
  const restartsRef = useRef(0)
  const silenceTimerRef = useRef<number | null>(null)
  const restartTimerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    onInterimRef.current = onInterim
  }, [onInterim])

  useEffect(() => {
    onEndRef.current = onEnd
  }, [onEnd])

  const setTranscript = useCallback((value: string) => {
    transcriptRef.current = value
    setTranscriptState(value)
  }, [])

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearInterval(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }, [])

  const startSilenceMonitor = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearInterval(silenceTimerRef.current)
    }
    lastActivityRef.current = Date.now()
    silenceTimerRef.current = window.setInterval(() => {
      const rec = recognitionRef.current
      if (!rec || !listeningRef.current) return
      if (Date.now() - lastActivityRef.current > stopTimeout) {
        // Sustained silence: assume the utterance is complete and finalize it.
        listeningRef.current = false
        try {
          rec.stop()
        } catch {
          // noop
        }
      }
    }, 300)
  }, [stopTimeout])

  const deliverTranscript = useCallback((text: string) => {
    onEndRef.current?.(text)
  }, [])

  // Create a brand-new recognition instance per listening session. Chrome's
  // SpeechRecognition is unreliable when an instance is restarted after it has
  // ended - it can silently drop the mic a split second after start(). A fresh
  // instance avoids that failure mode.
  const buildRecognition = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Recognition) return null

    const rec = new Recognition()
    rec.lang = lang
    rec.continuous = continuous
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (event) => {
      lastActivityRef.current = Date.now()
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ""
        if (result.isFinal) {
          finalTextRef.current = (finalTextRef.current + " " + text).trim()
        } else {
          interim += text
        }
      }
      const display = interim
        ? `${finalTextRef.current} ${interim}`.trim()
        : finalTextRef.current
      setTranscript(display)
      if (interim) onInterimRef.current?.(display)
    }

    rec.onerror = (event) => {
      const code = event?.error
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
        // Mic permission/device problem - do not keep retrying.
        listeningRef.current = false
        deliveredRef.current = true
        setIsListening(false)
      }
    }

    rec.onend = () => {
      setIsListening(false)
      const finalText = finalTextRef.current.trim()

      // Commit the captured utterance exactly once, when the session ends,
      // instead of streaming partial final chunks mid-sentence.
      if (finalText && !deliveredRef.current) {
        deliveredRef.current = true
        listeningRef.current = false
        clearTimers()
        deliverTranscript(finalText)
        return
      }

      // The user stopped the session (or nothing was ever captured and the
      // silence monitor already ended it deliberately).
      if (!listeningRef.current) {
        clearTimers()
        recognitionRef.current = null
        return
      }

      // Nothing was captured yet. Chrome sometimes ends a fresh session within
      // a fraction of a second before any audio arrives - restart so the user's
      // speech is still heard. Bounded so a broken mic cannot hot-loop.
      const premature = Date.now() - startedAtRef.current < restartThresholdMs
      if (premature && restartsRef.current < maxRestarts) {
        restartsRef.current += 1
        if (restartTimerRef.current !== null) {
          window.clearTimeout(restartTimerRef.current)
        }
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null
          if (!mountedRef.current || !listeningRef.current) return
          finalTextRef.current = ""
          setTranscript("")
          recognitionRef.current = null
          const next = buildRecognition()
          if (!next) return
          recognitionRef.current = next
          try {
            next.start()
            setIsListening(true)
            startSilenceMonitor()
          } catch {
            listeningRef.current = false
            setIsListening(false)
          }
        }, 350)
      } else {
        listeningRef.current = false
        clearTimers()
        recognitionRef.current = null
      }
    }

    return rec
  }, [
    lang,
    continuous,
    setTranscript,
    startSilenceMonitor,
    clearTimers,
    deliverTranscript,
    restartThresholdMs,
    maxRestarts,
  ])

  const startListening = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Recognition) return

    clearTimers()
    finalTextRef.current = ""
    deliveredRef.current = false
    listeningRef.current = true
    restartsRef.current = 0
    startedAtRef.current = Date.now()
    lastActivityRef.current = Date.now()
    setTranscript("")

    recognitionRef.current = null
    const rec = buildRecognition()
    if (!rec) return
    recognitionRef.current = rec
    try {
      rec.start()
      setIsListening(true)
      startSilenceMonitor()
    } catch {
      listeningRef.current = false
      setIsListening(false)
    }
  }, [buildRecognition, clearTimers, startSilenceMonitor, setTranscript])

  const stopListening = useCallback(() => {
    listeningRef.current = false
    const rec = recognitionRef.current
    if (rec) {
      try {
        rec.stop()
      } catch {
        try {
          rec.abort()
        } catch {
          // noop
        }
      }
    }
  }, [])

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    setIsSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition))
    return () => {
      mountedRef.current = false
      listeningRef.current = false
      clearTimers()
      try {
        recognitionRef.current?.abort()
      } catch {
        // noop
      }
      recognitionRef.current = null
    }
  }, [clearTimers])

  return {
    isListening,
    isSupported,
    transcript,
    startListening,
    stopListening,
  }
}
