"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button max-w-full relative overflow-hidden overflow-ellipsis min-w-0 relative inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 data-placeholder:pointer-events-none data-placeholder:opacity-100 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive text-background border-destructive hover:bg-destructive/80 focus-visible:border-destructive focus-visible:ring-destructive/25",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 text-sm",
        xs: "h-8 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        sm: "h-9 gap-1 rounded-[min(var(--radius-md),12px)] px-3 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
        lg: "h-11 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type TVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

const loaderColorClassMap: Record<TVariant, string> = {
  default: "text-primary-foreground",
  outline: "text-foreground",
  secondary: "text-secondary-foreground",
  ghost: "text-foreground",
  destructive: "text-background",
  link: "text-primary",
};

const placeholderTextClassMap: Record<TVariant, string> = {
  default: "group-data-placeholder/button:bg-primary-foreground/20",
  outline: "group-data-placeholder/button:bg-foreground/20",
  secondary: "group-data-placeholder/button:bg-secondary-foreground/20",
  ghost: "group-data-placeholder/button:bg-foreground/20",
  destructive: "group-data-placeholder/button:bg-background/20",
  link: "group-data-placeholder/button:bg-primary/20",
};

const placeholderDescendantTextClassMap: Record<TVariant, string> = {
  default: "[&_span]:group-data-placeholder/button:bg-primary-foreground/20",
  outline: "[&_span]:group-data-placeholder/button:bg-foreground/20",
  secondary: "[&_span]:group-data-placeholder/button:bg-secondary-foreground/20",
  ghost: "[&_span]:group-data-placeholder/button:bg-foreground/20",
  destructive: "[&_span]:group-data-placeholder/button:bg-background/20",
  link: "[&_span]:group-data-placeholder/button:bg-primary/20",
};

const placeholderIconClassMap: Record<TVariant, string> = {
  default: "[&_svg]:group-data-placeholder/button:bg-primary-foreground/20",
  outline: "[&_svg]:group-data-placeholder/button:bg-foreground/20",
  secondary: "[&_svg]:group-data-placeholder/button:bg-secondary-foreground/20",
  ghost: "[&_svg]:group-data-placeholder/button:bg-foreground/20",
  destructive: "[&_svg]:group-data-placeholder/button:bg-background/20",
  link: "[&_svg]:group-data-placeholder/button:bg-primary/20",
};

const placeholderTextSkeletonClass =
  "group-data-placeholder/button:text-transparent group-data-placeholder/button:animate-skeleton group-data-placeholder/button:rounded group-data-placeholder/button:select-none";

const placeholderDescendantTextSkeletonClass =
  "[&_span]:group-data-placeholder/button:text-transparent [&_span]:group-data-placeholder/button:animate-skeleton [&_span]:group-data-placeholder/button:rounded [&_span]:group-data-placeholder/button:select-none";

const placeholderIconSkeletonClass =
  "[&_svg]:group-data-placeholder/button:text-transparent [&_svg]:group-data-placeholder/button:animate-skeleton [&_svg]:group-data-placeholder/button:rounded";

type TButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    isPending?: boolean;
    isPlaceholder?: boolean;
  };

function Button({
  className,
  variant = "default",
  size = "default",
  isPending,
  isPlaceholder,
  children,
  disabled,
  ...props
}: TButtonProps) {
  const v = variant || "default";
  const loaderColorClass = loaderColorClassMap[v];
  const placeholderTextClass = placeholderTextClassMap[v];
  const placeholderIconClass = placeholderIconClassMap[v];
  const placeholderDescendantTextClass = placeholderDescendantTextClassMap[v];

  return (
    <ButtonPrimitive
      data-slot="button"
      data-pending={isPending ? "true" : undefined}
      data-placeholder={isPlaceholder ? "true" : undefined}
      className={cn(
        buttonVariants({ variant, size, className }),
        "data-pending:text-transparent data-pending:transition-none",
        placeholderIconClass,
        placeholderIconSkeletonClass,
        placeholderDescendantTextClass,
        placeholderDescendantTextSkeletonClass,
      )}
      disabled={isPending || isPlaceholder || disabled}
      {...props}
    >
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-data-pending/button:opacity-100 pointer-events-none">
        <LoaderIcon
          className={cn(
            "group-data-pending/button:animate-spin size-5",
            loaderColorClass,
          )}
        />
      </div>
      {typeof children === "string" ? (
        <span
          className={cn(
            "shrink min-w-0 overflow-hidden overflow-ellipsis relative",
            placeholderTextClass,
            placeholderTextSkeletonClass,
          )}
        >
          {children}
        </span>
      ) : (
        children
      )}
    </ButtonPrimitive>
  );
}

type TLinkButtonProps = ComponentProps<typeof Link> &
  VariantProps<typeof buttonVariants> & {
    isPending?: boolean;
    isPlaceholder?: boolean;
  };

function LinkButton({
  variant,
  size,
  isPending,
  isPlaceholder,
  className,
  children,
  ...props
}: TLinkButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      isPending={isPending}
      isPlaceholder={isPlaceholder}
      className={className}
      nativeButton={!!isPlaceholder}
      render={isPlaceholder ? undefined : <Link {...props} />}
    >
      {children}
    </Button>
  );
}

export { Button, LinkButton, buttonVariants };
