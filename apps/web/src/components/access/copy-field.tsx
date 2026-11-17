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
    <div
      className={cn(
        "flex items-start gap-1 rounded-lg border bg-muted/50 pl-3 pr-0.5 py-0.5",
        className,
      )}
    >
      <code
        className={cn("flex-1 min-w-0 py-1.5 font-mono text-sm", LAYOUT_CLASS[layout])}
      >
        {value}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={copy}
        aria-label="Copy"
        className="shrink-0 rounded-[calc(var(--radius-lg)-3px)] hover:bg-border active:bg-border"
      >
        {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      </Button>
    </div>
  );
}
