import * as React from "react"
import { useNavigate } from "react-router-dom"
import ReactMarkdown from "react-markdown"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea" // ensure this component exists in your shadcn set

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

export default function HomePage() {
  const navigate = useNavigate()

  // state (no react-hook-form)
  const [showForm, setShowForm] = React.useState(false)
  const [clientName, setClientName] = React.useState("")
  const [clientLinkedInUrl, setClientLinkedInUrl] = React.useState<string>("")
  const [aim, setAim] = React.useState<string>("")
  const [context, setContext] = React.useState<string>("")

  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isEnriching, setIsEnriching] = React.useState(false)
  const [editingContext, setEditingContext] = React.useState(false)

  // basic inline errors
  const [errors, setErrors] = React.useState<{ clientName?: string; clientLinkedInUrl?: string; enrich?: string }>({})

  const validate = () => {
    const next: typeof errors = {}
    if (!clientName.trim()) next.clientName = "Client name is required"
    if (clientLinkedInUrl.trim()) {
      try {
        const url = new URL(clientLinkedInUrl.trim())
        const ok = /(^|\.)linkedin\.com$/i.test(url.hostname)
        if (!ok) next.clientLinkedInUrl = "Must be a valid LinkedIn URL (e.g. https://www.linkedin.com/in/username)"
      } catch {
        next.clientLinkedInUrl = "Must be a valid URL"
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleEnrich = async () => {
    setErrors((e) => ({ ...e, enrich: undefined }))
    if (!clientLinkedInUrl.trim()) {
      setErrors((e) => ({ ...e, enrich: "LinkedIn URL required for enrichment" }))
      return
    }
    // reuse URL validation
    if (!validate()) return

    setIsEnriching(true)
    try {
      const response = await fetch(`${API_URL}/api/enrich_linkedin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: clientLinkedInUrl.trim() }),
      })
      if (!response.ok) throw new Error("Failed to enrich context")
      const data = await response.json()
      setContext(data.autofill_context || "")
      setEditingContext(false) // show rendered markdown
    } catch (err) {
      setErrors((e) => ({ ...e, enrich: err instanceof Error ? err.message : "Enrichment failed" }))
    } finally {
      setIsEnriching(false)
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    const combined = [
      clientName ? `Client Name: ${clientName}` : null,
      clientLinkedInUrl ? `LinkedIn: ${clientLinkedInUrl}` : null,
      aim ? `Aim: ${aim}` : null,
      context ? `Context:\n${context}` : null,
    ]
      .filter(Boolean)
      .join("\n\n")

    navigate("/chat", { state: { clientName, context: combined } })
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-rose-200 via-rose-100 to-rose-200 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        {/* Header / Title */}
        <div className="mb-10">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
            AI Chat Assistant
          </h1>
          <p className="mt-2 text-muted-foreground">
            Set up your client context and aim, then start the call.
          </p>
        </div>

        {!showForm ? (
          <div className="mt-16">
            <Button size="lg" onClick={() => setShowForm(true)} className="text-lg px-8 py-3">
              I&apos;m Ready
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="relative">
            {/* Two-column layout on desktop */}
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {/* Left column */}
              <section>
                <div className="space-y-5">
                  <div>
                    <label htmlFor="clientName" className="block text-sm font-medium mb-1">
                      Client Name
                    </label>
                    <Input
                      id="clientName"
                      placeholder="Acme Corp — Jane Doe"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                    />
                    {errors.clientName && <p className="mt-1 text-sm text-destructive">{errors.clientName}</p>}
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label htmlFor="clientLinkedInUrl" className="block text-sm font-medium">
                        Client LinkedIn URL (optional)
                      </label>
                      <Button type="button" variant="secondary" size="sm" onClick={handleEnrich} disabled={isEnriching}>
                        {isEnriching ? "Enriching…" : "Enrich"}
                      </Button>
                    </div>
                    <Input
                      id="clientLinkedInUrl"
                      type="url"
                      placeholder="https://www.linkedin.com/in/username"
                      value={clientLinkedInUrl}
                      onChange={(e) => setClientLinkedInUrl(e.target.value)}
                    />
                    {(errors.clientLinkedInUrl || errors.enrich) && (
                      <p className="mt-1 text-sm text-destructive">{errors.clientLinkedInUrl || errors.enrich}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="aim" className="block text-sm font-medium mb-1">
                      Aim of this Call
                    </label>
                    <Textarea
                      id="aim"
                      rows={5}
                      placeholder="e.g., Qualify lead, understand pain points, propose pilot timeline…"
                      value={aim}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAim(e.target.value)}
                      className="text-sm leading-relaxed"
                    />
                  </div>

                  <div className="pt-2">
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={isSubmitting || isEnriching}>
                      Back
                    </Button>
                  </div>
                </div>
              </section>

              {/* Right column: Context (markdown by default, Edit toggle) */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="context" className="block text-sm font-medium">
                    Enriched Context
                  </label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditingContext((v) => !v)}>
                    {editingContext ? "Done" : "Edit"}
                  </Button>
                </div>

                <div className="rounded-md border bg-card min-h-[22rem] p-3 text-sm leading-relaxed">
                  {editingContext ? (
                    <Textarea
                      id="context"
                      rows={12}
                      placeholder="Paste or edit the enriched summary here…"
                      value={context}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContext(e.target.value)}
                      className="text-sm leading-relaxed"
                    />
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none overflow-y-auto max-h-[28rem] [&_p]:my-2 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:my-1 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted">
                      <ReactMarkdown>
                        {context && context.trim().length > 0
                          ? context
                          : "_No context yet. Click **Edit** to add, or use **Enrich** after providing a LinkedIn URL._"}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Fixed Start button */}
            <div className="fixed right-6 bottom-6">
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? "Starting…" : "Start call"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
