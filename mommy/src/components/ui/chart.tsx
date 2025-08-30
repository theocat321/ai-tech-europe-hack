import type { CSSProperties, ReactNode } from 'react'
import { Tooltip as RechartsTooltip, Legend as RechartsLegend } from 'recharts'

export type ChartConfig = Record<string, { label?: string; color?: string }>

type ChartContainerProps = {
  config?: ChartConfig
  className?: string
  children: ReactNode
}

// Minimal shadcn-style chart container that exposes CSS vars for series colors
export function ChartContainer({ config, className, children }: ChartContainerProps) {
  const style: CSSProperties = {}
  if (config) {
    for (const [key, value] of Object.entries(config)) {
      if (value?.color) {
        ;(style as any)[`--color-${key}`] = value.color
      }
    }
  }
  return (
    <div className={['rounded-md border bg-background p-2', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  )
}

// Re-export recharts Tooltip/Legend under shadcn-style names
export const ChartTooltip = RechartsTooltip
export const ChartLegend = RechartsLegend

// Generic tooltip content styled to match shadcn look & feel
export function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-sm">
      {label != null && (
        <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{String(label)}</div>
      )}
      <div className="space-y-1">
        {payload.map((entry: any, i: number) => {
          const color = entry.color || 'hsl(var(--chart-1))'
          const name = entry.name || entry.dataKey
          return (
            <div key={i} className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-muted-foreground">{name}</span>
              </div>
              <span className="tabular-nums">{entry.value}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Optional legend content if needed later
export function ChartLegendContent({ payload }: any) {
  if (!payload?.length) return null
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {payload.map((entry: any, i: number) => (
        <div key={i} className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}
