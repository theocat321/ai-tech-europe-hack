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

type OaiEvent = {
  type: string
  [k: string]: any
}

export default function ChatPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const context = (location.state as { context?: string })?.context || ''
  const [clientSecret, setClientSecret] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isListening, setIsListening] = React.useState(true)
  const [isLoading, setIsLoading] = React.useState(false)
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
  const pcRef = React.useRef<RTCPeerConnection | null>(null)
  const eventsDcRef = React.useRef<RTCDataChannel | null>(null)
  const localStreamRef = React.useRef<MediaStream | null>(null)
  const remoteAudioRef = React.useRef<HTMLAudioElement | null>(null)

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

  const playWhisper = React.useCallback(async (text: string) => {
    try {
      const res = await fetch(`${API_URL}/api/whisper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok || !res.body) {
        throw new Error('Failed to fetch whisper audio')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.play().catch(() => {/* ignore */})
      audio.onended = () => URL.revokeObjectURL(url)
    } catch (e) {
      // Do not block chat on whisper failures
      console.error('whisper error', e)
    }
  }, [])

  // Start server session to get client secret
  React.useEffect(() => {
    const startSession = async () => {
      try {
        const res = await fetch(`${API_URL}/api/realtime`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context }),
        })
        if (!res.ok) throw new Error('Failed to start session')
        const data = await res.json()
        setClientSecret(data.client_secret)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to start session')
      }
    }
    startSession()
  }, [context])

  // Establish WebRTC to OpenAI Realtime once we have a client secret
  React.useEffect(() => {
    if (!clientSecret) return

    let pc: RTCPeerConnection
    let eventsDc: RTCDataChannel
    let stopped = false

    const setup = async () => {
      try {
        setIsLoading(true)
        pc = new RTCPeerConnection()
        pcRef.current = pc

        // Remote audio
        pc.ontrack = (e) => {
          if (!remoteAudioRef.current) return
          remoteAudioRef.current.srcObject = e.streams[0]
          remoteAudioRef.current.play().catch(() => {/* autoplay may be blocked */})
        }

        // Events data channel from server
        pc.ondatachannel = (evt) => {
          if (evt.channel.label === 'oai-events') {
            const ch = evt.channel
            ch.onmessage = (m) => handleOaiEvent(m.data)
          }
        }

        // Local events channel to send events (optional)
        eventsDc = pc.createDataChannel('oai-events')
        eventsDcRef.current = eventsDc

        // Mic capture
        const ms = await navigator.mediaDevices.getUserMedia({ audio: true })
        localStreamRef.current = ms
        ms.getAudioTracks().forEach((t) => pc.addTrack(t, ms))

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        const baseUrl = 'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17'
        const r = await fetch(baseUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
        })
        if (!r.ok) throw new Error('Realtime handshake failed')
        const ansSdp = await r.text()
        await pc.setRemoteDescription({ type: 'answer', sdp: ansSdp })
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : 'Connection failed')
      } finally {
        if (!stopped) setIsLoading(false)
      }
    }

    const handleOaiEvent = (raw: any) => {
      try {
        const evt: OaiEvent = typeof raw === 'string' ? JSON.parse(raw) : raw
        // Intentionally ignore normal assistant text to remain silent-listener.
        // We only surface tool-based hints to the UI.
        // Tool invocation
        if (evt.type === 'response.tool_call') {
          const name = evt.name
          const args = evt.arguments || {}
          if (name === 'whisper_hint' && typeof args.hint === 'string') {
            const hint: string = args.hint
            const follow: string = args.followup_question || ''
            // Show a subtle text message and play whisper audio
            appendMessage(`(hint) ${hint}${follow ? ` — Try: ${follow}` : ''}`, false)
            // Play as whisper audio via backend
            playWhisper(`${hint}. ${follow}`)
          }
        }
      } catch (e) {
        console.warn('Failed to parse oai event', e)
      }
    }

    setup()

    return () => {
      stopped = true
      try {
        eventsDcRef.current?.close()
      } catch {}
      eventsDcRef.current = null
      try {
        pcRef.current?.getSenders().forEach((s) => {
          try { s.track?.stop() } catch {}
        })
        pcRef.current?.close()
      } catch {}
      pcRef.current = null
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop())
        localStreamRef.current = null
      }
    }
  }, [clientSecret, appendMessage, playWhisper])

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
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isListening ? "Listening…" : "Paused"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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

          {/* Hidden audio element for remote TTS */}
          <audio ref={remoteAudioRef} hidden playsInline />
        </div>
      </div>
    </div>
  )
}
