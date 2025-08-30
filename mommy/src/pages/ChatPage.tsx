import * as React from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Mic, MicOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface Message {
  id: string
  text: string
  isUser: boolean
  timestamp: Date
  initials?: string
}

export default function ChatPage() {
  const navigate = useNavigate()
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

  // Example: simulated incoming AI message while "listening"
  React.useEffect(() => {
    if (!isListening) return
    // demo only: fake an AI follow-up after 2s
    const t = setTimeout(() => {
      setIsLoading(true)
      const msg: Message = {
        id: crypto.randomUUID(),
        text:
          "This is a simulated response captured while listening. Connect your STT pipeline to push transcriptions here.",
        isUser: false,
        timestamp: new Date(),
        initials: "AI",
      }
      setMessages((prev) => [...prev, msg])
      setIsLoading(false)
    }, 2000)
    return () => clearTimeout(t)
  }, [isListening])

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="w-full h-screen flex flex-col">
        {/* Header */}
        <div className="w-full bg-card/80 backdrop-blur-sm border-b">
          <div className="w-full px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-lg font-semibold">AI Chat Session</h1>
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
        </div>
      </div>
    </div>
  )
}
