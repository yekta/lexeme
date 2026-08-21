import {
  EmptyList,
  EmptyListContent,
  EmptyListDescription,
  EmptyListFooter,
  EmptyListHeader,
  EmptyListIcon,
  EmptyListTitle,
} from "@/components/empty-list";
import { LinkButton } from "@/components/ui/button";
import { LockIcon } from "lucide-react";

export function NoAccess() {
  return (
    <EmptyList>
      <EmptyListHeader>
        <EmptyListIcon>
          <LockIcon />
        </EmptyListIcon>
        <EmptyListContent>
          <EmptyListTitle>You don't have access</EmptyListTitle>
          <EmptyListDescription>
            You don&apos;t have permission to view this deck.
          </EmptyListDescription>
        </EmptyListContent>
      </EmptyListHeader>
      <EmptyListFooter>
        <LinkButton href="/">Go Home</LinkButton>
      </EmptyListFooter>
    </EmptyList>
  );
}
