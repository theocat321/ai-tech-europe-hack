//
import { useLocation, Link } from 'react-router-dom'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'

type Stats = {
  segments: number
  hints: number
  flowSegments: number
  aspects: Record<string, number>
  startedAt: number
  endedAt?: number
}

type TimelinePoint = { t: number; warned: boolean }

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <Progress value={pct} />
    </div>
  )
}

function Donut({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total > 0 ? value / total : 0
  const r = 26
  const C = 2 * Math.PI * r
  const dash = Math.max(0, Math.min(C, pct * C))
  return (
    <div className="flex items-center gap-2">
      <svg width="64" height="64" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="36" cy="36" r={r} fill="none" stroke="#10b981" strokeWidth="8"
          strokeDasharray={`${dash} ${C - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
        />
        <text x="36" y="40" textAnchor="middle" className="fill-current text-xs">{Math.round(pct * 100)}%</text>
      </svg>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-base font-medium">{value} / {total}</div>
      </div>
    </div>
  )
}

//

export default function SummaryPage() {
  const location = useLocation()
  const { stats, timeline, hintTimes } = (location.state as { stats?: Stats; timeline?: TimelinePoint[]; hintTimes?: number[] }) || {}
  const [showDonuts, setShowDonuts] = useState(true)
  const [showWarnings, setShowWarnings] = useState(true)
  const [showHints, setShowHints] = useState(true)
  const [showAspects, setShowAspects] = useState(true)

  if (!stats) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">No session data found.</p>
          <Button asChild>
            <Link to="/">Go Home</Link>
          </Button>
        </div>
      </div>
    )
  }

  const durationMs = (stats.endedAt || Date.now()) - stats.startedAt
  const durationMin = Math.max(1, Math.round(durationMs / 60000))
  const flowPct = stats.segments > 0 ? Math.round((stats.flowSegments / stats.segments) * 100) : 0
  const aspectEntries = Object.entries(stats.aspects)
  const maxAspect = Math.max(1, ...aspectEntries.map(([, v]) => v))
  const warnedSegments = (timeline || []).filter(p => p.warned).length
  const flowVsWarned = { flow: stats.flowSegments, warned: warnedSegments }

  const sparkPoints = (timeline || []).map(p => (p.warned ? 1 : 0))
  const minutes = Math.max(1, Math.ceil(durationMs / 60000))
  const hintsPerMinute: number[] = Array.from({ length: minutes }, (_, i) => {
    const bucketStart = stats.startedAt + i * 60000
    const bucketEnd = bucketStart + 60000
    return (hintTimes || []).filter((t) => t >= bucketStart && t < bucketEnd).length
  })

  // --- Mom Test Score -----------------------------------------------------------
  // Combine: flow ratio (helps), anti-pattern counts (penalize), and hints (penalize)
  const flowScore = Math.round(flowPct * 0.6) // up to 60 pts
  const weights: Record<string, number> = {
    compliment: 2,
    hypothetical: 3,
    leading: 5,
    pitching: 6,
    fluff: 2,
    yesno: 3,
    vague: 3,
  }
  const aspectPenaltyRaw = aspectEntries.reduce((acc, [k, v]) => acc + (weights[k] || 0) * Number(v || 0), 0)
  const aspectPenalty = Math.min(40, aspectPenaltyRaw) // cap
  const hintPenalty = Math.min(25, stats.hints * 3)
  const momScore = Math.max(0, Math.min(100, flowScore + (40 - aspectPenalty) - hintPenalty))
  const scoreLabel = momScore >= 85 ? 'Excellent' : momScore >= 70 ? 'Good' : momScore >= 55 ? 'Fair' : 'Needs Work'

  const aspectLabels: Record<string, string> = {
    compliment: 'Compliments',
    hypothetical: 'Hypotheticals',
    leading: 'Leading questions',
    pitching: 'Pitching',
    fluff: 'Opinions / Fluff',
    yesno: 'Yes/No traps',
    vague: 'Vague universals',
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-rose-50 via-white to-rose-50 dark:from-gray-950 dark:via-black dark:to-gray-950">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Tiger Mom — Session Summary</h1>
            <p className="text-sm text-muted-foreground">A quick look at your Mom Test flow and pitfalls.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline"><Link to="/">New Session</Link></Button>
          </div>
        </div>

        {/* KPI + Score */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="md:col-span-1">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Mom Test Score</div>
              <div className="text-3xl font-bold mt-1">{momScore}</div>
              <div className="mt-2">
                <Progress value={momScore} />
              </div>
              <div className="text-xs text-muted-foreground mt-1">{scoreLabel}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Duration</div>
              <div className="text-2xl font-semibold mt-1">~{durationMin}m</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Hints</div>
              <div className="text-2xl font-semibold mt-1">{stats.hints}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Flow (segments without warnings)</div>
              <div className="text-2xl font-semibold mt-1">{flowPct}%</div>
            </CardContent>
          </Card>
        </div>

        {/* 2-column layout: left (two halves) + right (full) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left column: donuts (top half) + hints (bottom half) */}
          <div className="flex flex-col gap-4">
            <Card className={showDonuts ? undefined : 'py-2 gap-2'}>
              <CardContent className={showDonuts ? 'px-4 py-3' : 'px-3 py-2'}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Flow vs Warned</div>
                  <Button variant="ghost" size="sm" onClick={() => setShowDonuts(v => !v)} aria-expanded={showDonuts}>
                    {showDonuts ? '▾' : '▸'}
                  </Button>
                </div>
                {showDonuts && (
                  <div className="mt-2 h-40 md:h-48 w-full flex items-center justify-center">
                    <div className="flex items-center justify-between gap-6 w-full max-w-lg">
                      <Donut value={flowVsWarned.flow} total={(timeline || []).length || stats.segments} label="Flow segments" />
                      <Donut value={flowVsWarned.warned} total={(timeline || []).length || stats.segments} label="Warned segments" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={showHints ? undefined : 'py-2 gap-2'}>
              <CardContent className={showHints ? 'px-4 py-3' : 'px-3 py-2'}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Hints per minute</div>
                  <Button variant="ghost" size="sm" onClick={() => setShowHints(v => !v)} aria-expanded={showHints}>
                    {showHints ? '▾' : '▸'}
                  </Button>
                </div>
                {showHints && (
                  <div className="mt-2">
                    {(() => {
                      const hintsData = hintsPerMinute.map((v, i) => ({ index: i + 1, hints: v }))
                      return (
                        <ChartContainer
                          config={{ hints: { label: 'Hints', color: '#10b981' } }}
                          className="w-full h-40 md:h-48"
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={hintsData} margin={{ left: 6, right: 6, top: 10, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis dataKey="index" tickLine={false} axisLine={false} fontSize={12} />
                              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                              <Line type="monotone" dataKey="hints" stroke="var(--color-hints)" strokeWidth={2} dot={false} />
                              <ChartTooltip content={<ChartTooltipContent />} cursor={{ stroke: 'hsl(var(--muted))' }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </ChartContainer>
                      )
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: warnings (full height) */}
          <Card className={showWarnings ? undefined : 'py-2 gap-2'}>
            <CardContent className={showWarnings ? 'px-4 py-3' : 'px-3 py-2'}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Segment warnings over time</div>
                <Button variant="ghost" size="sm" onClick={() => setShowWarnings(v => !v)} aria-expanded={showWarnings}>
                  {showWarnings ? '▾' : '▸'}
                </Button>
              </div>
              {showWarnings && (
                <div className="mt-2">
                  {(() => {
                    const data = sparkPoints.map((v, i) => ({ index: i + 1, warned: v }))
                    return (
                      <ChartContainer
                        config={{ warned: { label: 'Warned', color: '#ef4444' } }}
                        className="w-full h-80 md:h-96"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={data} margin={{ left: 6, right: 6, top: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis dataKey="index" tickLine={false} axisLine={false} fontSize={12} />
                            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} domain={[0, 'dataMax + 1']} />
                            <Line type="monotone" dataKey="warned" stroke="var(--color-warned)" strokeWidth={2} dot={false} />
                            <ChartTooltip content={<ChartTooltipContent />} cursor={{ stroke: 'hsl(var(--muted))' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    )
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        </div>



        {/* Aspect Bars */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Mom Test Anti‑Patterns</div>
              <Button variant="ghost" size="sm" onClick={() => setShowAspects(v => !v)}>
                {showAspects ? 'Hide' : 'Show'}
              </Button>
            </div>
            {showAspects && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                {aspectEntries.map(([key, val]) => (
                  <BarRow key={key} label={aspectLabels[key] || key} value={val} max={maxAspect} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
