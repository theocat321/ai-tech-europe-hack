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
  const audioUnlockedRef = React.useRef<boolean>(false)
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [segmentCount, setSegmentCount] = React.useState<number>(0)
  const [lastTranscript, setLastTranscript] = React.useState<string>("")
  const [aspects, setAspects] = React.useState<Array<{ key: string; title: string; message: string; followup: string }>>([])
  const seenAspectKeysRef = React.useRef<Set<string>>(new Set())
  const [stats, setStats] = React.useState<{
    segments: number
    hints: number
    flowSegments: number
    aspects: Record<string, number>
    startedAt: number
    endedAt?: number
  }>({
    segments: 0,
    hints: 0,
    flowSegments: 0,
    aspects: { compliment: 0, hypothetical: 0, leading: 0, pitching: 0, fluff: 0, yesno: 0, vague: 0 },
    startedAt: Date.now(),
  })
  const [timeline, setTimeline] = React.useState<Array<{ t: number; warned: boolean }>>([])
  const [hintTimes, setHintTimes] = React.useState<number[]>([])

  // Detect Mom Test anti-patterns from the latest transcript chunk
  const detectAspects = React.useCallback((text: string) => {
    const t = (text || '').toLowerCase()
    const found: Array<{ key: string; title: string; message: string; followup: string }> = []

    const push = (key: string, title: string, message: string, followup: string) => {
      if (!found.some((a) => a.key === key)) found.push({ key, title, message, followup })
    }

    // Compliments
    if (/(that'?s|thats)?\s*(great|awesome|amazing|cool|nice|love\s+it|sounds\s+good|fantastic)/.test(t)) {
      push(
        'compliment',
        '[compliment]',
        'Compliments hide facts.',
        ''
      )
    }

    // Hypotheticals / future talk
    if (/(would|will|might|plan to|planning to|in the future|do you think)/.test(t)) {
      push(
        'hypothetical',
        '[hypothetical]',
        'Drop hypotheticals.',
        ''
      )
    }

    // Leading question / confirmation bias
    if (/(wouldn'?t\s+you|don'?t\s+you\s+think|isn'?t\s+that\s+right|right\?|yeah\?)/.test(t)) {
      push(
        'leading',
        '[leading]',
        'Leading questions bias answers. Ask neutrally.',
        ''
      )
    }

    // Pitching / solutioning
    if (/(our\s+(product|tool|solution)|we\s+(built|can|will|offer)|let\s+me\s+show|demo)/.test(t)) {
      push(
        'pitching',
        '[pitching]',
        'Avoid pitching.',
        ''
      )
    }

    // Opinions / fluff
    if (/(i\s+think|maybe|probably|i\s+guess|seems|interesting)/.test(t)) {
      push(
        'fluff',
        '[fluff]',
        'Opinions ≠ evidence.',
        ''
      )
    }

    // Yes/No trap
    if (/^(do|did|is|are|was|were|have)\s+you\b/.test(t)) {
      push(
        'yesno',
        '[yes/no]',
        'Avoid yes/no.',
        ''
      )
    }

    // Vague universals
    if (/(always|never|everyone|no\s+one)/.test(t)) {
      push(
        'vague',
        '[vague]',
        'Get specific.',
        ''
      )
    }

    return found
  }, [])

  // Label metadata for LLM-detected aspect keys
  const aspectMeta = React.useMemo(() => ({
    compliment: { title: '[compliment]', message: 'Compliments hide facts.' },
    hypothetical: { title: '[hypothetical]', message: 'Drop hypotheticals.' },
    leading: { title: '[leading]', message: 'Leading questions bias answers. Ask neutrally.' },
    pitching: { title: '[pitching]', message: 'Avoid pitching.' },
    fluff: { title: '[fluff]', message: 'Opinions ≠ evidence.' },
    yesno: { title: '[yes/no]', message: 'Avoid yes/no.' },
    vague: { title: '[vague]', message: 'Get specific.' },
  }), [])

  const unlockAudio = React.useCallback(async () => {
    try {
      let ctx = audioCtxRef.current
      if (!ctx) {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        audioCtxRef.current = ctx
      }
      if (ctx.state === 'suspended') await ctx.resume()
      audioUnlockedRef.current = ctx.state === 'running'
    } catch {
      // ignore
    }
  }, [])

  const playChime = React.useCallback(async () => {
    if (!chimeEnabledRef.current) return
    try {
      await unlockAudio()
      const ctx = audioCtxRef.current
      if (!ctx || ctx.state !== 'running') return
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

  // Unlock audio on first user interaction (browser autoplay policy)
  React.useEffect(() => {
    const handler = () => {
      unlockAudio()
    }
    document.addEventListener('pointerdown', handler, { once: true })
    return () => document.removeEventListener('pointerdown', handler)
  }, [unlockAudio])

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
                  if (text) {
                    setLastTranscript(text)
                    // Prefer LLM detection; fallback to local regex
                    let found: Array<{ key: string; title: string; message: string; followup: string }> = []
                    try {
                      const det = await fetch(`${API_URL}/api/aspect_detect`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ session_id: sData.session_id, text }),
                      })
                      if (det.ok) {
                        const j = await det.json()
                        const keys: string[] = Array.isArray(j?.aspects) ? j.aspects : []
                        found = keys.map((key) => ({
                          key,
                          title: (aspectMeta as any)[key]?.title || `[${key}]`,
                          message: (aspectMeta as any)[key]?.message || 'Check phrasing.',
                          followup: '',
                        }))
                      } else {
                        found = detectAspects(text)
                      }
                    } catch {
                      found = detectAspects(text)
                    }
                    setAspects(found)
                    // Append new aspect warnings into the feed (dedup by key)
                    const seen = seenAspectKeysRef.current
                    for (const a of found) {
                      if (!seen.has(a.key)) {
                        // Fetch LLM-generated follow-up based on context
                        (async () => {
                          try {
                            const sid = sData.session_id
                            const r = await fetch(`${API_URL}/api/aspect_suggest`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ session_id: sid, aspect: a.key }),
                            })
                            let q = ''
                            if (r.ok) {
                              const j = await r.json()
                              q = (j?.question || '').trim()
                            }
                            appendMessage(`${a.title} ${a.message}${q ? ` — Try: ${q}` : ''}`, false)
                            if (!speakHints) playChime()
                          } catch {
                            appendMessage(`${a.title} ${a.message}`, false)
                            if (!speakHints) playChime()
                          }
                        })()
                        seen.add(a.key)
                        if (seen.size > 100) {
                          // prevent unbounded growth
                          seenAspectKeysRef.current = new Set(Array.from(seen).slice(-50))
                        }
                      }
                    }
                    // Update stats
                    const now = Date.now()
                    setTimeline((prev) => [...prev, { t: now, warned: found.length > 0 }])
                    setStats((prev) => {
                      const next = { ...prev, segments: prev.segments + 1 }
                      if (found.length === 0) {
                        next.flowSegments = prev.flowSegments + 1
                      } else {
                        const aspectsCounts = { ...prev.aspects }
                        for (const a of found) {
                          if (a.key in aspectsCounts) aspectsCounts[a.key] += 1
                        }
                        next.aspects = aspectsCounts
                      }
                      return next
                    })
                  }
                } else {
                  setSegmentCount((c) => c + 1)
                  setStats((prev) => ({ ...prev, segments: prev.segments + 1 }))
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

  // End background session on unmount/navigation
  React.useEffect(() => {
    return () => {
      const sid = sessionId
      if (sid) {
        // Fire and forget
        fetch(`${API_URL}/api/session/end?session_id=${sid}`, { method: 'POST' }).catch(() => {})
      }
    }
  }, [sessionId])

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
          setStats((prev) => ({ ...prev, hints: prev.hints + 1 }))
          setHintTimes((prev) => [...prev, Date.now()])
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
                  Tiger Mom Session
                  <span
                    title="Silent listener: hints only"
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
              {/* Speaking toggle first */}
              <Button
                variant={speakHints ? "default" : "outline"}
                size="sm"
                onClick={() => setSpeakHints((v) => !v)}
                title="Toggle spoken hints"
              >
                {speakHints ? 'Speaking On' : 'Speaking Off'}
              </Button>
              {/* Pause/Resume second */}
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
              {/* End Call last */}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const sid = sessionId
                  try {
                    setStats((prev) => ({ ...prev, endedAt: Date.now() }))
                    if (sid) await fetch(`${API_URL}/api/session/end?session_id=${sid}`, { method: 'POST' })
                  } catch {}
                  navigate('/summary', { state: { stats, timeline, hintTimes } })
                }}
                title="End call and view summary"
              >
                End Call
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

                {(() => {
                  const txt = message.text || ''
                  const aspectKey = txt.startsWith('[compliment]') ? 'compliment'
                    : txt.startsWith('[hypothetical]') ? 'hypothetical'
                    : txt.startsWith('[leading]') ? 'leading'
                    : txt.startsWith('[pitching]') ? 'pitching'
                    : txt.startsWith('[fluff]') ? 'fluff'
                    : txt.startsWith('[yes/no]') ? 'yesno'
                    : txt.startsWith('[vague]') ? 'vague'
                    : null
                  const aspectClasses: Record<string, string> = {
                    compliment: 'border-amber-300 bg-amber-50 dark:bg-amber-950/30',
                    hypothetical: 'border-sky-300 bg-sky-50 dark:bg-sky-950/30',
                    leading: 'border-rose-400 bg-rose-50 dark:bg-rose-950/30',
                    pitching: 'border-violet-300 bg-violet-50 dark:bg-violet-950/30',
                    fluff: 'border-gray-300 bg-gray-50 dark:bg-gray-900/50',
                    yesno: 'border-cyan-300 bg-cyan-50 dark:bg-cyan-950/30',
                    vague: 'border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30',
                  }
                  const base = message.isUser ? 'bg-primary text-primary-foreground' : 'bg-card'
                  const style = aspectKey ? `border ${aspectClasses[aspectKey]}` : base
                  return (
                    <Card className={`max-w-[80%] ${style}`}>
                      <CardContent className="p-3">
                        <p className="text-sm leading-relaxed">{message.text}</p>
                        <p className={`text-[11px] mt-1 ${message.isUser ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </CardContent>
                    </Card>
                  )
                })()}

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
          {/* Floating Recorder Indicator (bottom-right, raised to make space for FAB) */}
          <div className="fixed bottom-24 right-4 pointer-events-auto">
            <Card className="w-72 shadow-lg bg-card/90 backdrop-blur-sm border">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${isListening ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`}
                    title={isListening ? 'Recording segments' : 'Paused'}
                  />
                  <span className="text-xs text-muted-foreground">Recording</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-300 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300"
                    title="Transcription language: English"
                  >
                    EN
                  </span>
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
            {/* Aspect warnings moved into main feed */}
          </div>
            
          {/* Floating Action Buttons (Demo) */}
          <div className="fixed right-4 bottom-4 flex flex-col gap-2 pointer-events-auto">
            <Button
              size="icon"
              className={`h-12 w-12 rounded-full shadow-lg ${demoMode ? 'bg-blue-600 text-white hover:bg-blue-600' : ''}`}
              variant={demoMode ? 'default' : 'outline'}
              onClick={() => setDemoMode((v) => !v)}
              title={demoMode ? 'Demo Mode On' : 'Enable Demo Mode'}
            >
              DM
            </Button>
            {demoMode && (
              <Button
                size="icon"
                className="h-12 w-12 rounded-full shadow-lg"
                variant="secondary"
                onClick={() => {
                  const hint = 'They mentioned a workaround; ask the last time it broke.'
                  const follow = 'Walk me through the most recent failure and how you handled it.'
                  appendMessage(`(hint) ${hint} — Try: ${follow}`, false)
                  if (!speakHints) {
                    playChime()
                  } else {
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
                title="Force Hint Now"
              >
                ▶
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
