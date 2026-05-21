import BgPattern from "@/components/bg-pattern";
import {
  EmptyList,
  EmptyListContent,
  EmptyListDescription,
  EmptyListFooter,
  EmptyListHeader,
  EmptyListIcon,
  EmptyListTitle,
} from "@/components/empty-list";
import { Button, LinkButton } from "@/components/ui/button";
import { TriangleAlertIcon } from "lucide-react";

export function LoadError({
  error,
  onRetry,
}: {
  error?: unknown;
  onRetry?: () => void;
}) {
  const message = error instanceof Error ? error.message : undefined;

  return (
    <EmptyList>
      <EmptyListHeader>
        <EmptyListIcon className="bg-destructive/15">
          <TriangleAlertIcon className="text-destructive" />
        </EmptyListIcon>
        <EmptyListContent className="max-w-2xl">
          <EmptyListTitle className="text-destructive">
            Something went wrong
          </EmptyListTitle>
          {message ? (
            <div className="mt-3 max-h-[max(30vh,20rem)] bg-card overflow-hidden flex flex-col relative rounded-md border">
              <BgPattern />
              <pre className="h-full overflow-auto relative px-3 py-2 text-left text-sm font-mono whitespace-pre-wrap break-words">
                {message}
              </pre>
            </div>
          ) : (
            <EmptyListDescription>
              We couldn&apos;t load this page. Please try again.
            </EmptyListDescription>
          )}
        </EmptyListContent>
      </EmptyListHeader>
      <EmptyListFooter>
        {onRetry && <Button onClick={onRetry}>Try Again</Button>}
        <LinkButton variant={onRetry ? "outline" : "default"} href="/">
          Go Home
        </LinkButton>
      </EmptyListFooter>
    </EmptyList>
  );
}
