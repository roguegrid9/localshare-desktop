import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent-solid focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-bg-surface text-text-primary hover:bg-border",
        accent:
          "border-transparent bg-accent-solid text-white hover:opacity-hover",
        gradient:
          "border-transparent bg-gradient-to-r from-accent-gradient-start to-accent-gradient-end text-white",
        destructive:
          "border-transparent bg-error text-white hover:opacity-hover",
        outline: "text-text-primary border-border",
        success: "border-transparent bg-success text-white hover:opacity-hover",
        warning: "border-transparent bg-warning text-white hover:opacity-hover",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
