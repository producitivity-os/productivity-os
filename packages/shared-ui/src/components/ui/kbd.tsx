import type * as React from "react"

import { cn } from "../../lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-zinc-300 shadow-sm",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
