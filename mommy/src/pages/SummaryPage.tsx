import * as React from 'react'
import { useLocation, Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

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
  const r = 28
  const C = 2 * Math.PI * r
  const dash = Math.max(0, Math.min(C, pct * C))
  return (
    <div className="flex items-center gap-3">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="36" cy="36" r={r} fill="none" stroke="#10b981" strokeWidth="8"
          strokeDasharray={`${dash} ${C - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
        />
        <text x="36" y="40" textAnchor="middle" className="fill-current text-sm">{Math.round(pct * 100)}%</text>
      </svg>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-medium">{value} / {total}</div>
      </div>
    </div>
  )
}

function Sparkline({ points, width = 480, height = 60 }: { points: number[]; width?: number; height?: number }) {
  if (points.length === 0) return <div className="h-[60px]" />
  const max = Math.max(1, ...points)
  const step = points.length > 1 ? width / (points.length - 1) : width
  const d = points
    .map((y, i) => {
      const px = i * step
      const py = height - (y / max) * height
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={width} height={height} className="text-emerald-500">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export default function SummaryPage() {
  const location = useLocation()
  const { stats, timeline, hintTimes } = (location.state as { stats?: Stats; timeline?: TimelinePoint[]; hintTimes?: number[] }) || {}

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

        {/* Flow vs Warned (Donut) + Segment Sparkline */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center justify-between">
              <Donut value={flowVsWarned.flow} total={(timeline || []).length || stats.segments} label="Flow segments" />
              <Donut value={flowVsWarned.warned} total={(timeline || []).length || stats.segments} label="Warned segments" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 space-y-2">
              <div className="text-sm font-medium">Segment warnings over time</div>
              <Sparkline points={sparkPoints} />
            </CardContent>
          </Card>
        </div>

        {/* Hint rate over time */}
        <Card>
          <CardContent className="p-5 space-y-2">
            <div className="text-sm font-medium">Hints per minute</div>
            <Sparkline points={hintsPerMinute} />
          </CardContent>
        </Card>

        {/* Aspect Bars */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="text-sm font-medium">Mom Test Anti‑Patterns</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {aspectEntries.map(([key, val]) => (
                <BarRow key={key} label={aspectLabels[key] || key} value={val} max={maxAspect} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
