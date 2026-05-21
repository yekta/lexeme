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

export function LoadError({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyList>
      <EmptyListHeader>
        <EmptyListIcon>
          <TriangleAlertIcon />
        </EmptyListIcon>
        <EmptyListContent>
          <EmptyListTitle>Something went wrong</EmptyListTitle>
          <EmptyListDescription>
            We couldn&apos;t load this page. Please try again.
          </EmptyListDescription>
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
