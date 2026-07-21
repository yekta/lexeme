"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoaderIcon, Sparkles } from "lucide-react";

export function SuggestButton({
  isPending,
  disabled,
  onClick,
  className,
}: {
  isPending: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "shrink-0 min-w-0 px-2.5 py-1 overflow-hidden gap-1.5 -mr-1 -mt-1 -mb-1",
        className,
      )}
      disabled={disabled || isPending}
      onClick={onClick}
    >
      <div className="size-3.5 shrink-0 -ml-0.5">
        {isPending ? (
          <LoaderIcon className="size-full animate-spin translate-z-0" />
        ) : (
          <Sparkles className="size-full" />
        )}
      </div>
      <span className="truncate">{isPending ? "Suggesting" : "Suggest"}</span>
    </Button>
  );
}
