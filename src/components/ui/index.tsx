"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Card */

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1 border-b border-line px-5 py-4", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-base font-semibold text-ink-900", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-ink-500", className)} {...props} />;
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

/* ----------------------------------------------------------------- Badge */

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-surface-sunken text-ink-700",
        brand: "bg-brand-50 text-brand-700",
        success: "bg-success-50 text-success-700",
        warning: "bg-warning-50 text-warning-700",
        danger: "bg-danger-50 text-danger-700",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/* ----------------------------------------------------------------- Input */

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400",
      "transition-colors focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none",
      "disabled:bg-surface-sunken disabled:text-ink-400",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm text-ink-900 placeholder:text-ink-400",
      "transition-colors focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink-900",
      "transition-colors focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("mb-1.5 block text-sm font-medium text-ink-700", className)}
      {...props}
    />
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1.5 text-sm text-danger-700">{children}</p>;
}

/* -------------------------------------------------------------- Progress */

export function Progress({
  value,
  className,
  tone = "brand",
}: {
  value: number;
  className?: string;
  tone?: "brand" | "success" | "warning" | "danger";
}) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const toneClass = {
    brand: "gradient-brand",
    success: "bg-success-500",
    warning: "bg-warning-500",
    danger: "bg-danger-500",
  }[tone];

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-sunken", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", toneClass)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ EmptyState */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm text-ink-500">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- Skeleton */

export function Skeleton({
  className,
}: {
  className?: string;
}) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

/* ------------------------------------------------------------------ Stat */

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "brand",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "brand" | "success" | "warning" | "neutral";
}) {
  const toneClass = {
    brand: "bg-brand-50 text-brand-600",
    success: "bg-success-50 text-success-700",
    warning: "bg-warning-50 text-warning-700",
    neutral: "bg-surface-sunken text-ink-700",
  }[tone];

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-ink-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
        </div>
        {icon ? (
          <div className={cn("flex size-10 items-center justify-center rounded-xl", toneClass)}>
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Alert */

export function Alert({
  tone = "brand",
  title,
  children,
  className,
}: {
  tone?: "brand" | "success" | "warning" | "danger";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const toneClass = {
    brand: "border-brand-200 bg-brand-50 text-brand-900",
    success: "border-success-500/30 bg-success-50 text-success-700",
    warning: "border-warning-500/30 bg-warning-50 text-warning-700",
    danger: "border-danger-500/30 bg-danger-50 text-danger-700",
  }[tone];

  return (
    <div className={cn("rounded-xl border px-4 py-3 text-sm", toneClass, className)}>
      {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}
