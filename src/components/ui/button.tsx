"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap select-none",
    "transition-[background-color,box-shadow,transform,filter,border-color] duration-150 ease-out",
    "focus-visible:ring-4 focus-visible:ring-brand-200 focus-visible:outline-none",
    "active:translate-y-px",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:active:translate-y-0",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "gradient-brand text-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_10px_20px_-12px_rgba(79,70,229,0.75)] hover:brightness-[1.08] hover:shadow-[0_1px_2px_rgba(15,23,42,0.1),0_14px_26px_-12px_rgba(79,70,229,0.85)] active:brightness-95",
        secondary:
          "border border-line bg-white text-ink-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-ink-400/40 hover:bg-surface-muted active:bg-surface-sunken",
        ghost:
          "text-ink-700 hover:bg-surface-sunken hover:text-ink-900 active:bg-surface-sunken/80",
        outline:
          "border border-brand-200 bg-brand-50/50 text-brand-700 hover:border-brand-300 hover:bg-brand-50 active:bg-brand-100",
        danger:
          "bg-danger-500 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_10px_20px_-14px_rgba(239,68,68,0.8)] hover:bg-danger-700 focus-visible:ring-danger-500/25",
        success:
          "bg-success-500 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_10px_20px_-14px_rgba(16,185,129,0.8)] hover:bg-success-700 focus-visible:ring-success-500/25",
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
  (
    { className, variant, size, block, loading, children, disabled, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {/* Yükleme sırasında içerik yerinde kalsın, düğme zıplamasın. */}
      <span
        className={cn(
          "inline-flex items-center gap-2",
          loading && "invisible",
        )}
      >
        {children}
      </span>
      {loading ? (
        <Loader2 className="absolute animate-spin" aria-hidden />
      ) : null}
    </button>
  ),
);
Button.displayName = "Button";

export { buttonVariants };
