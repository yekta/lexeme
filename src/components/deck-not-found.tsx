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
import { SearchIcon } from "lucide-react";

export function DeckNotFound() {
  return (
    <EmptyList>
      <EmptyListHeader>
        <EmptyListIcon>
          <SearchIcon />
        </EmptyListIcon>
        <EmptyListContent>
          <EmptyListTitle>Deck not found</EmptyListTitle>
          <EmptyListDescription>
            This deck doesn&apos;t exist or may have been deleted.
          </EmptyListDescription>
        </EmptyListContent>
      </EmptyListHeader>
      <EmptyListFooter>
        <LinkButton href="/">Go Home</LinkButton>
      </EmptyListFooter>
    </EmptyList>
  );
}
