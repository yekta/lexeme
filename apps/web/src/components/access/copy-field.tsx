import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COPIED_FEEDBACK_MS = 1500;

const LAYOUT_CLASS = {
  line: "truncate",
  snippet: "whitespace-pre overflow-x-auto",
  wrap: "whitespace-pre-wrap break-all",
};

export function CopyField({
  value,
  layout = "line",
  className,
}: {
  value: string;
  layout?: keyof typeof LAYOUT_CLASS;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  };

  return (
    <div className={cn("relative", className)}>
      <code
        className={cn(
          "block rounded-lg border bg-muted/50 pl-3 pr-9.5 py-2 font-mono text-sm",
          LAYOUT_CLASS[layout],
        )}
      >
        {value}
      </code>
      <div className="absolute top-px right-px rounded-[calc(var(--radius-lg)-1px)] bg-[color-mix(in_srgb,var(--muted)_50%,var(--background))] p-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={copy}
          aria-label="Copy"
          className="rounded-[calc(var(--radius-lg)-3px)] hover:bg-border active:bg-border"
        >
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
