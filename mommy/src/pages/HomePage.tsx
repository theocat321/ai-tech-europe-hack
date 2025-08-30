import * as React from "react"
import { useNavigate } from "react-router-dom"
import ReactMarkdown from "react-markdown"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

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
    <div className="min-h-screen w-full bg-gradient-to-b from-rose-50 via-white to-rose-50 dark:from-gray-950 dark:via-black dark:to-gray-950">
      <div className="mx-auto w-full max-w-6xl px-4 py-12">
        {/* Hero */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Tiger Mom — Silent Listener Coach
          </div>
          <h1 className="mt-4 text-4xl md:text-6xl font-semibold tracking-tight">
            Ask about facts, not opinions.
          </h1>
          <p className="mt-3 max-w-2xl text-base md:text-lg text-muted-foreground">
            Tiger Mom quietly listens to your customer interviews and nudges you to dig deeper when it matters — workarounds, spend, timelines, and stakeholders.
          </p>
          {!showForm && (
            <div className="mt-8 flex items-end gap-3">
              <Button size="lg" onClick={() => setShowForm(true)} className="text-base px-6">
                Start Preparing
              </Button>
              <a
                href="https://momtestbook.com/" target="_blank" rel="noreferrer"
                className="text-sm text-muted-foreground hover:underline pb-1"
              >
                What is the Mom Test?
              </a>
            </div>
          )}
        </div>

        {/* Pillars */}
        {!showForm && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {[{
              title: 'Workarounds', desc: 'Catch improvised fixes and failure points that reveal real pain.'
            }, {
              title: 'Money & Time', desc: 'Notice concrete spend and time costs instead of vague interest.'
            }, {
              title: 'Timeline & Roles', desc: 'Surface deadlines and decision-makers behind the scenes.'
            }].map((c) => (
              <div key={c.title} className="rounded-xl border bg-white/90 dark:bg-gray-900/90 p-5 shadow-sm">
                <div className="text-sm font-semibold">{c.title}</div>
                <p className="mt-1.5 text-sm text-muted-foreground">{c.desc}</p>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <form onSubmit={onSubmit} className="relative">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {/* Left column */}
              <section className="rounded-xl border bg-white/90 dark:bg-gray-900/90 p-5 shadow-sm">
                <div className="mb-3">
                  <h2 className="text-lg font-semibold">Client Setup</h2>
                  <p className="text-sm text-muted-foreground">Provide the minimum info needed to start.</p>
                </div>
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

                  <div className="pt-2 flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={isSubmitting || isEnriching}>
                      Back
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Starting…" : "Start call"}
                    </Button>
                  </div>
                </div>
              </section>

              {/* Right column: Context (markdown by default, Edit toggle) */}
              <section className="rounded-xl border bg-white/90 dark:bg-gray-900/90 p-5 shadow-sm">
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

            {/* Start/Back buttons are next to each other above */}
          </form>
        )}
      </div>
    </div>
  )
}
