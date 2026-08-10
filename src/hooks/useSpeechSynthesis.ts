import { useCallback, useEffect, useRef, useState } from "react"

interface UseSpeechSynthesisOptions {
  lang?: string
  rate?: number
  pitch?: number
  onEnd?: () => void
}

export function useSpeechSynthesis(options: UseSpeechSynthesisOptions = {}) {
  const { lang = "en-US", rate = 1, pitch = 1, onEnd } = options

  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const onEndRef = useRef(onEnd)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)
  const disposedRef = useRef(false)

  useEffect(() => {
    onEndRef.current = onEnd
  }, [onEnd])

  useEffect(() => {
    setIsSupported("speechSynthesis" in window)
  }, [])

  // Voices load asynchronously in Chromium, so resolve the best match when
  // they become available (and again on every change). Without an explicit
  // voice, Chrome sometimes silently never speaks.
  useEffect(() => {
    if (!("speechSynthesis" in window)) return
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices()
      const preferred =
        voices.find((v) => v.lang === lang && v.default) ||
        voices.find((v) => v.lang === lang) ||
        voices.find((v) => v.lang.startsWith(lang.split("-")[0])) ||
        voices.find((v) => v.localService) ||
        voices[0]
      voiceRef.current = preferred ?? null
    }
    pickVoice()
    window.speechSynthesis.addEventListener("voiceschanged", pickVoice)
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", pickVoice)
    }
  }, [lang])

  const cancel = useCallback(() => {
    if (!("speechSynthesis" in window)) return
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
    setIsPaused(false)
  }, [])

  const speak = useCallback(
    (text: string) => {
      if (!("speechSynthesis" in window) || !text.trim()) return

      // If synthesis was left paused (e.g. by a manual Pause), a new utterance
      // silently waits in a paused queue. Resume first so it actually plays.
      if (window.speechSynthesis.paused) window.speechSynthesis.resume()
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang
      utterance.rate = rate
      utterance.pitch = pitch
      if (voiceRef.current) utterance.voice = voiceRef.current

      utterance.onstart = () => {
        setIsSpeaking(true)
        setIsPaused(false)
      }
      utterance.onend = () => {
        setIsSpeaking(false)
        setIsPaused(false)
        onEndRef.current?.()
      }
      utterance.onerror = () => {
        setIsSpeaking(false)
        setIsPaused(false)
      }

      // Chromium can drop an utterance when speak() is called in the same tick
      // as cancel(). Deferring by one tick lets the engine clear its queue
      // first. Guard against firing after the hook is unmounted.
      window.setTimeout(() => {
        if (disposedRef.current) return
        if (!("speechSynthesis" in window)) return
        window.speechSynthesis.speak(utterance)
      }, 0)
    },
    [lang, rate, pitch]
  )

  const pause = useCallback(() => {
    if (!("speechSynthesis" in window)) return
    window.speechSynthesis.pause()
    setIsPaused(true)
    setIsSpeaking(false)
  }, [])

  const resume = useCallback(() => {
    if (!("speechSynthesis" in window)) return
    window.speechSynthesis.resume()
    setIsPaused(false)
    setIsSpeaking(true)
  }, [])

  useEffect(() => {
    disposedRef.current = false
    const w = window
    const handler = () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel()
    }
    w.onbeforeunload = handler
    return () => {
      disposedRef.current = true
      w.onbeforeunload = null
      if ("speechSynthesis" in window) window.speechSynthesis.cancel()
    }
  }, [])

  return { isSpeaking, isSupported, isPaused, speak, cancel, pause, resume }
}