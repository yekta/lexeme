import { useCanGoBack, useRouter } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Returns to wherever the user came from in the app; `fallbackHref` when the page was opened directly. */
export function BackButton({ fallbackHref, className }: { fallbackHref: string; className?: string }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!canGoBack) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    router.history.back();
  };

  return (
    <LinkButton
      variant="ghost"
      href={fallbackHref}
      aria-label="Back"
      onClick={onClick}
      className={cn("shrink-0 size-9", className)}
    >
      <ArrowLeftIcon className="size-5 shrink-0" />
    </LinkButton>
  );
}
