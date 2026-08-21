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
import { CompassIcon } from "lucide-react";
import type * as React from "react";

export function PageNotFound({
  title = "Page not found",
  description = "The page you're looking for doesn't exist or may have been moved.",
  children,
}: {
  title?: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <EmptyList>
      <EmptyListHeader>
        <EmptyListIcon>
          <CompassIcon />
        </EmptyListIcon>
        <EmptyListContent>
          <EmptyListTitle>{title}</EmptyListTitle>
          <EmptyListDescription>{description}</EmptyListDescription>
        </EmptyListContent>
      </EmptyListHeader>
      <EmptyListFooter>
        {children ?? <LinkButton href="/">Go Home</LinkButton>}
      </EmptyListFooter>
    </EmptyList>
  );
}
