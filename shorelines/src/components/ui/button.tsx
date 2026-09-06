import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * Retheme note: shadcn's generated variants pointed at its own
 * primary/secondary/muted/accent/destructive/background/foreground/border/
 * input/ring tokens (and shipped `dark:` variants) — none of which exist in
 * this app's palette (see the `@theme` block in globals.css). Every class
 * below maps to the app's own tokens instead; `dark:` variants are dropped
 * outright since the identity is a single sun-lit theme with no dark mode.
 *
 * Radius: the per-size `rounded-[min(var(--radius-md),Npx)]` calc shadcn
 * generates depended on a `--radius` token this app never defines. `rounded-
 * pill` (999px) is the app's own full-round convention (see Stepper's ±
 * buttons, CTA pills in ui.tsx) and renders identically on a square icon
 * button, so it replaces the calc uniformly rather than reintroducing a
 * token this app doesn't have.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-pill border border-transparent bg-clip-padding font-sans text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-deeptide focus-visible:ring-3 focus-visible:ring-deeptide/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-clay aria-invalid:ring-3 aria-invalid:ring-clay/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-deeptide text-foam hover:bg-deeptide-deep",
        outline:
          "border-hairline bg-card hover:bg-card-hover aria-expanded:bg-card-hover text-driftwood",
        secondary:
          "bg-shell text-driftwood hover:bg-card-hover aria-expanded:bg-card-hover",
        ghost:
          "hover:bg-deeptide/8 text-driftwood aria-expanded:bg-deeptide/8",
        destructive:
          "bg-clay/10 text-clay hover:bg-clay/20 focus-visible:border-clay/40 focus-visible:ring-clay/20",
        link: "text-deeptide underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 px-2 text-xs in-data-[slot=button-group]:rounded-pill has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-pill has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 in-data-[slot=button-group]:rounded-pill [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 in-data-[slot=button-group]:rounded-pill",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
