import * as React from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, Mic, MicOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface Message {
  id: string
  text: string
  isUser: boolean
  timestamp: Date
  initials?: string
}

// Realtime event type removed; background mode only

export default function ChatPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const context = (location.state as { context?: string, speakHints?: boolean })?.context || ''
  const initialSpeak = Boolean((location.state as { speakHints?: boolean })?.speakHints)
  const [speakHints, setSpeakHints] = React.useState<boolean>(initialSpeak)
  // Realtime client secret removed in background mode
  const [error, setError] = React.useState<string | null>(null)
  const [isListening, setIsListening] = React.useState(true)
  const [isLoading, setIsLoading] = React.useState(false)
  const [demoMode, setDemoMode] = React.useState(false)
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: "1",
      text: "I’m listening. Start speaking whenever you’re ready.",
      isUser: false,
      timestamp: new Date(),
      initials: "AI",
    },
  ])

  // WebRTC refs
  const localStreamRef = React.useRef<MediaStream | null>(null)
  // Text-only hints: no whisper audio playback
  const audioCtxRef = React.useRef<AudioContext | null>(null)
  const chimeEnabledRef = React.useRef<boolean>(true)
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [segmentCount, setSegmentCount] = React.useState<number>(0)
  const [lastTranscript, setLastTranscript] = React.useState<string>("")

  const playChime = React.useCallback(async () => {
    if (!chimeEnabledRef.current) return
    try {
      let ctx = audioCtxRef.current
      if (!ctx) {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        audioCtxRef.current = ctx
      }
      if (ctx.state === 'suspended') await ctx.resume()
      const duration = 0.18
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = 880
      g.gain.setValueAtTime(0.001, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
      o.connect(g).connect(ctx.destination)
      o.start()
      o.stop(ctx.currentTime + duration)
    } catch {
      // ignore audio errors
    }
  }, [])

  const appendMessage = React.useCallback((text: string, isUser = false) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text,
        isUser,
        timestamp: new Date(),
        initials: isUser ? 'YOU' : 'AI',
      },
    ])
  }, [])

  // No-op; whisper audio removed

  // Realtime disabled in background mode

  // Background mode: start session, then capture mic and send chunks to backend STT
  React.useEffect(() => {
    let recorder: MediaRecorder | null = null
    let stopped = false

    const boot = async () => {
      try {
        setIsLoading(true)
        // Start background session
        const sRes = await fetch(`${API_URL}/api/session/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context, speak_hints: speakHints }),
        })
        if (!sRes.ok) throw new Error('Failed to start session')
        const sData = await sRes.json()
        setSessionId(sData.session_id)

        // Mic capture
        const ms = await navigator.mediaDevices.getUserMedia({ audio: true })
        localStreamRef.current = ms
        const mime = (window as any).MediaRecorder?.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'

        const startOne = () => {
          if (stopped) return
          try {
            recorder = new MediaRecorder(ms, { mimeType: mime })
          } catch (e) {
            recorder = new MediaRecorder(ms)
          }
          const chunks: Blob[] = []
          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size) chunks.push(ev.data)
          }
          recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: mime })
            if (blob.size && sData.session_id) {
              try {
                const resp = await fetch(`${API_URL}/api/stt_chunk?session_id=${sData.session_id}`, {
                  method: 'POST', headers: { 'Content-Type': mime }, body: blob,
                })
                if (resp.ok) {
                  const data = await resp.json()
                  const text: string = (data?.text || '').trim()
                  setSegmentCount((c) => c + 1)
                  if (text) setLastTranscript(text)
                } else {
                  setSegmentCount((c) => c + 1)
                }
              } catch (e) { console.warn('stt_chunk failed', e) }
            }
            // Start next segment
            if (!stopped) startOne()
          }
          recorder.start()
          setTimeout(() => { try { recorder?.stop() } catch {} }, 5000)
        }
        startOne()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to start')
      } finally {
        setIsLoading(false)
      }
    }

    boot()

    return () => {
      stopped = true
      try { recorder?.stop() } catch {}
      recorder = null
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop())
        localStreamRef.current = null
      }
    }
  }, [context, speakHints])

  // Poll for hints
  React.useEffect(() => {
    if (!sessionId) return
    let timer: any
    const tick = async () => {
      try {
        const r = await fetch(`${API_URL}/api/hints?session_id=${sessionId}`)
        if (!r.ok) return
        const data = await r.json()
        const hints = (data?.hints || []) as Array<{hint: string, followup_question: string}>
        for (const h of hints) {
          appendMessage(`(hint) ${h.hint} — Try: ${h.followup_question}`, false)
          if (!speakHints) playChime()
          else {
            // speak via OpenAI TTS
            try {
              const tts = await fetch(`${API_URL}/api/tts`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: `${h.hint}. ${h.followup_question}` })
              })
              if (tts.ok) {
                const blob = await tts.blob()
                const url = URL.createObjectURL(blob)
                const audio = new Audio(url)
                audio.play().finally(() => URL.revokeObjectURL(url))
              }
            } catch {}
          }
        }
      } finally {
        timer = setTimeout(tick, 4000)
      }
    }
    tick()
    return () => clearTimeout(timer)
  }, [sessionId, appendMessage, playChime, speakHints])

  // Toggle mic enable/disable when isListening changes
  React.useEffect(() => {
    const s = localStreamRef.current
    if (!s) return
    s.getAudioTracks().forEach((t) => (t.enabled = isListening))
  }, [isListening])

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="w-full h-screen flex flex-col">
        {/* Header */}
        <div className="w-full bg-card/80 backdrop-blur-sm border-b">
          <div className="w-full px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-lg font-semibold flex items-center gap-2">
                  AI Chat Session
                  <span
                    title="Silent listener: only whispers hints"
                    className="text-[11px] px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300"
                  >
                    Hints Only
                  </span>
                  {speakHints && (
                    <span
                      title="Speaking short hints is enabled"
                      className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                    >
                      Speaking
                    </span>
                  )}
                  {demoMode && (
                    <span
                      title="Demo mode is ON"
                      className="text-[11px] px-2 py-0.5 rounded-full border border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500/40 dark:bg-blue-950/40 dark:text-blue-300"
                    >
                      Demo
                    </span>
                  )}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isListening ? "Listening…" : "Paused"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Single default whisper voice; dropdown removed */}
              <Button
                variant={demoMode ? "default" : "outline"}
                size="sm"
                onClick={() => setDemoMode((v) => !v)}
              >
                {demoMode ? 'Demo On' : 'Demo Mode'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!demoMode}
                onClick={() => {
                  const hint = 'They mentioned a workaround; ask the last time it broke.'
                  const follow = 'Walk me through the most recent failure and how you handled it.'
                  appendMessage(`(hint) ${hint} — Try: ${follow}`, false)
                  if (!speakHints) {
                    playChime()
                  } else {
                    // Speak via backend TTS
                    fetch(`${API_URL}/api/tts`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text: `${hint}. ${follow}` }),
                    }).then(async (r) => {
                      if (!r.ok) return
                      const blob = await r.blob()
                      const url = URL.createObjectURL(blob)
                      const audio = new Audio(url)
                      audio.play().finally(() => URL.revokeObjectURL(url))
                    }).catch(() => {})
                  }
                }}
                title={demoMode ? 'Trigger a sample hint' : 'Enable Demo Mode to use'}
              >
                Force Hint Now
              </Button>
              <Button
                variant={speakHints ? "default" : "outline"}
                size="sm"
                onClick={() => setSpeakHints((v) => !v)}
                title="Toggle spoken hints"
              >
                {speakHints ? 'Speaking On' : 'Speaking Off'}
              </Button>
              <Button
                variant={isListening ? "secondary" : "default"}
                size="sm"
                onClick={() => setIsListening((v) => !v)}
              >
                {isListening ? (
                  <>
                    <MicOff className="h-4 w-4 mr-2" />
                    Pause
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-2" />
                    Resume
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-center mt-4">{error}</p>
        )}

        {/* Messages */}
        <div className="relative flex-1 w-full overflow-y-auto px-4 py-4">
          <div className="w-full max-w-3xl mx-auto space-y-3 pb-28">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-end gap-2 ${message.isUser ? "justify-end" : "justify-start"
                  }`}
              >
                {!message.isUser && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{message.initials ?? "AI"}</AvatarFallback>
                  </Avatar>
                )}

                <Card
                  className={`max-w-[80%] ${message.isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-card"
                    }`}
                >
                  <CardContent className="p-3">
                    <p className="text-sm leading-relaxed">{message.text}</p>
                    <p
                      className={`text-[11px] mt-1 ${message.isUser
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                        }`}
                    >
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </CardContent>
                </Card>

                {message.isUser && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>YOU</AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <Card className="max-w-[80%]">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex space-x-1">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/70 animate-bounce" />
                        <span
                          className="w-2 h-2 rounded-full bg-muted-foreground/70 animate-bounce"
                          style={{ animationDelay: "120ms" }}
                        />
                        <span
                          className="w-2 h-2 rounded-full bg-muted-foreground/70 animate-bounce"
                          style={{ animationDelay: "240ms" }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground">
                        AI is thinking…
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Floating Listening Control */}
          <div className="pointer-events-none fixed left-1/2 bottom-6 -translate-x-1/2">
            <div className="relative h-16 w-16">
              {/* Pulses */}
              {isListening && (
                <>
                  <span className="absolute inset-0 rounded-full bg-primary/25 animate-ping" />
                  <span className="absolute inset-0 rounded-full bg-primary/15 animate-ping [animation-delay:150ms]" />
                </>
              )}
              {/* Mic button */}
              <div className="pointer-events-auto">
                <Button
                  size="icon"
                  className="h-16 w-16 rounded-full shadow-lg"
                  onClick={() => setIsListening((v) => !v)}
                >
                  {isListening ? (
                    <Mic className="h-6 w-6" />
                  ) : (
                    <MicOff className="h-6 w-6" />
                  )}
                  <span className="sr-only">
                    {isListening ? "Pause listening" : "Resume listening"}
                  </span>
                </Button>
              </div>
            </div>
          </div>

          {/* Only chime or OpenAI TTS playback handled programmatically */}
          {/* Floating Recorder Indicator (bottom-right) */}
          <div className="fixed bottom-4 right-4 pointer-events-auto">
            <Card className="w-72 shadow-lg bg-card/90 backdrop-blur-sm border">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${isListening ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`}
                    title={isListening ? 'Recording segments' : 'Paused'}
                  />
                  <span className="text-xs text-muted-foreground">Recording</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">Seg: {segmentCount}</span>
                </div>
                <div className="text-xs text-foreground/90">
                  <span className="font-medium">Last:</span>{' '}
                  <span className="truncate inline-block align-middle max-w-[220px]" title={lastTranscript || 'No transcript yet'}>
                    {lastTranscript || '—'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
