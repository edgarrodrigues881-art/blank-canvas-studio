import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const iconBadgeVariants = cva(
  "inline-flex items-center justify-center shrink-0 rounded-full",
  {
    variants: {
      size: {
        sm: "w-7 h-7 [&_svg]:w-3.5 [&_svg]:h-3.5",
        md: "w-9 h-9 [&_svg]:w-[18px] [&_svg]:h-[18px]",
        lg: "w-11 h-11 [&_svg]:w-5 [&_svg]:h-5",
      },
      variant: {
        primary: "bg-primary/10 text-primary",
        muted: "bg-muted text-muted-foreground",
        destructive: "bg-destructive/10 text-destructive",
        warning: "bg-amber-500/10 text-amber-500",
        success: "bg-emerald-500/10 text-emerald-500",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "primary",
    },
  }
);

export interface IconBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof iconBadgeVariants> {}

const IconBadge = React.forwardRef<HTMLDivElement, IconBadgeProps>(
  ({ className, size, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(iconBadgeVariants({ size, variant, className }))}
      {...props}
    />
  )
);
IconBadge.displayName = "IconBadge";

export { IconBadge, iconBadgeVariants };
