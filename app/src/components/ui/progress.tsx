"use client"

import * as React from "react"
import { cn } from "#/lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20 in-data-[area=painel]:bg-brand/20",
        className
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 origin-left bg-primary in-data-[area=painel]:bg-brand transition-transform duration-lento ease-saida motion-reduce:transition-none"
        style={{ transform: `scaleX(${Math.min(100, Math.max(0, value || 0)) / 100})` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
