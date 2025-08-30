import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function AboutMePage() {
  // Section titles (stable)
  const TITLES = useMemo(
    () => [
      'Who I Am',
      'What I’m Doing',
      'My Goals',
      'Important rules',
      'How best the assistant can help',
    ],
    []
  )

  const [whoIAm, setWhoIAm] = useState('')
  const [whatImDoing, setWhatImDoing] = useState('')
  const [myGoals, setMyGoals] = useState('')
  const [importantRules, setImportantRules] = useState('')
  const [howBestToHelp, setHowBestToHelp] = useState('')

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Parse server text into our sections when possible
  const parseIntoSections = (raw: string) => {
    // Expect markdown-ish "## Title" blocks, but be lenient.
    const sections: Record<string, string> = {}
    let current: string | null = null
    const lines = raw.split(/\r?\n/)
    const pushLine = (title: string, line: string) => {
      sections[title] = (sections[title] ?? '') + (sections[title] ? '\n' : '') + line
    }
    for (const line of lines) {
      const m = line.match(/^\s{0,3}(?:##|#)?\s*(Who I Am|What I’m Doing|What I'm Doing|My Goals|Important rules|How best the assistant can help)\s*:?\s*$/i)
      if (m) {
        // Normalize to our exact-cased title
        const key = TITLES.find(t => t.toLowerCase() === m[1].toLowerCase().replace("'", "’")) || m[1]
        current = key
        if (!(current in sections)) sections[current] = ''
      } else if (current) {
        pushLine(current, line)
      } else {
        // No heading found yet – accumulate into first section as a fallback
        current = TITLES[0]
        pushLine(current, line)
      }
    }

    setWhoIAm((sections[TITLES[0]] || '').trim())
    setWhatImDoing((sections['What I’m Doing'] || sections["What I'm Doing"] || '').trim())
    setMyGoals((sections[TITLES[2]] || '').trim())
    setImportantRules((sections[TITLES[3]] || '').trim())
    setHowBestToHelp((sections[TITLES[4]] || '').trim())
  }

  useEffect(() => {
    const fetchContext = async () => {
      setIsLoading(true)
      setError(null)
      setSaved(false)
      try {
        const response = await fetch(`${API_URL}/api/personal_context`)
        if (!response.ok) {
          throw new Error('Failed to fetch personal context.')
        }
        const data = await response.text()
        if (data?.trim()) {
          parseIntoSections(data)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buildContent = () => {
    // Concatenate sections with titles as markdown
    const blocks = [
      { title: 'Who I Am', body: whoIAm },
      { title: 'What I’m Doing', body: whatImDoing },
      { title: 'My Goals', body: myGoals },
      { title: 'Important rules', body: importantRules },
      { title: 'How best the assistant can help', body: howBestToHelp },
    ]
    return blocks
      .map(({ title, body }) => `## ${title}\n${(body || '').trim()}`)
      .join('\n\n')
      .trim()
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSaved(false)
    try {
      const content = buildContent()
      const response = await fetch(`${API_URL}/api/personal_context`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      })
      if (!response.ok) {
        throw new Error('Failed to save personal context.')
      }
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-rose-50 via-white to-rose-50 dark:from-gray-950 dark:via-black dark:to-gray-950">
      {/* Header */}
      <header className="w-full border-b bg-white/80 dark:bg-gray-900/70 backdrop-blur-md">
        <div className="h-1 w-full bg-rose-500/80" />
        <div className="px-6 py-8 max-w-4xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            Your Mom-Test Profile
          </h1>
          <p className="mt-2 text-sm md:text-base text-gray-600 dark:text-gray-300 max-w-2xl">
            Keep it concise and truthful. Strong prompts come from clear goals and constraints.
          </p>
        </div>
      </header>

      {/* Content */}
      <main className="px-6 py-10 max-w-4xl mx-auto">
        {isLoading ? (
          <p>Loading…</p>
        ) : (
          <div className="space-y-8">
            {error && (
              <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>
            )}

            {/* Who I Am */}
            <section className="space-y-3 rounded-xl border bg-white/90 dark:bg-gray-900/90 p-5 shadow-sm">
              <Label htmlFor="who" className="text-lg font-semibold">Who I Am</Label>
              <p className="text-sm text-gray-600 dark:text-gray-400">Background, role, relevant experience, domain.</p>
              <textarea
                id="who"
                className="w-full min-h-40 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-[15px] leading-relaxed shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/70"
                placeholder="E.g., Product founder with dev background in fintech."
                value={whoIAm}
                onChange={(e) => setWhoIAm(e.target.value)}
                rows={8}
              />
            </section>

            {/* What I’m Doing */}
            <section className="space-y-3 rounded-xl border bg-white/90 dark:bg-gray-900/90 p-5 shadow-sm">
              <Label htmlFor="doing" className="text-lg font-semibold">What I’m Doing</Label>
              <p className="text-sm text-gray-600 dark:text-gray-400">Current project, problem, or hypothesis you’re exploring.</p>
              <textarea
                id="doing"
                className="w-full min-h-40 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-[15px] leading-relaxed shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/70"
                placeholder="E.g., Validating demand for a lightweight interview assistant."
                value={whatImDoing}
                onChange={(e) => setWhatImDoing(e.target.value)}
                rows={8}
              />
            </section>

            {/* My Goals */}
            <section className="space-y-3 rounded-xl border bg-white/90 dark:bg-gray-900/90 p-5 shadow-sm">
              <Label htmlFor="goals" className="text-lg font-semibold">My Goals</Label>
              <p className="text-sm text-gray-600 dark:text-gray-400">Desired outcomes, success criteria, timeline.</p>
              <textarea
                id="goals"
                className="w-full min-h-40 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-[15px] leading-relaxed shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/70"
                placeholder="E.g., 10 qualified interviews, 3 paying trials in 6 weeks."
                value={myGoals}
                onChange={(e) => setMyGoals(e.target.value)}
                rows={8}
              />
            </section>

            {/* Important rules */}
            <section className="space-y-3 rounded-xl border bg-white/90 dark:bg-gray-900/90 p-5 shadow-sm">
              <Label htmlFor="rules" className="text-lg font-semibold">Important rules</Label>
              <p className="text-sm text-gray-600 dark:text-gray-400">Things to avoid, constraints, preferences, tone.</p>
              <textarea
                id="rules"
                className="w-full min-h-40 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-[15px] leading-relaxed shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/70"
                placeholder="E.g., No fluff, challenge assumptions, short answers."
                value={importantRules}
                onChange={(e) => setImportantRules(e.target.value)}
                rows={8}
              />
            </section>

            {/* How best the assistant can help */}
            <section className="space-y-3 rounded-xl border bg-white/90 dark:bg-gray-900/90 p-5 shadow-sm">
              <Label htmlFor="help" className="text-lg font-semibold">How best the assistant can help</Label>
              <p className="text-sm text-gray-600 dark:text-gray-400">Ways of working that help you the most.</p>
              <textarea
                id="help"
                className="w-full min-h-40 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-[15px] leading-relaxed shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500/70"
                placeholder="E.g., Ask for specifics, highlight risks, propose concrete next steps."
                value={howBestToHelp}
                onChange={(e) => setHowBestToHelp(e.target.value)}
                rows={8}
              />
            </section>

            <div className="h-24" />
          </div>
        )}
      </main>

      {/* Sticky Save Bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-white/80 dark:bg-gray-900/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {saved ? 'Saved' : isSaving ? 'Saving…' : 'Unsaved changes'}
          </div>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save Profile'}
          </Button>
        </div>
      </div>
    </div>
  )
}
