"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme, theme = "system" } = useTheme();

  return (
    <Sonner
      theme={(resolvedTheme ?? theme) as ToasterProps["theme"]}
      className="toaster group font-sans"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          fontFamily: "inherit",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast font-sans",
          title: "text-[var(--toast-accent,inherit)]! font-bold text-sm!",
          description: "text-foreground! text-sm! font-light!",
          icon: "text-[var(--toast-accent,inherit)]",
          error: "[--toast-accent:var(--destructive)] border-destructive/25!",
          success: "[--toast-accent:var(--success)] border-success/25!",
          warning: "[--toast-accent:var(--primary)] border-primary/25!",
          info: "[--toast-accent:var(--primary)] border-primary/25!",
          loading:
            "[--toast-accent:var(--muted-foreground)] border-muted-foreground/25!",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
