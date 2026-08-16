"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "gradient-brand text-white shadow-[0_8px_24px_-10px_rgba(79,70,229,0.7)] hover:brightness-110 active:brightness-95",
        secondary:
          "bg-white text-ink-900 border border-line hover:bg-surface-sunken",
        ghost: "text-ink-700 hover:bg-surface-sunken",
        outline:
          "border border-brand-200 text-brand-700 bg-brand-50/40 hover:bg-brand-50",
        danger: "bg-danger-500 text-white hover:bg-danger-700",
        success: "bg-success-500 text-white hover:bg-success-700",
      },
      size: {
        sm: "h-9 px-3 text-sm [&_svg]:size-4",
        md: "h-11 px-4 text-sm [&_svg]:size-4",
        lg: "h-12 px-6 text-base [&_svg]:size-5",
        icon: "size-10 [&_svg]:size-4",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export { buttonVariants };
