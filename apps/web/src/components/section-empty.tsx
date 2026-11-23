import type { ReactNode } from "react";

import {
  EmptyList,
  EmptyListContent,
  EmptyListDescription,
  EmptyListHeader,
  EmptyListIcon,
  EmptyListTitle,
} from "@/components/empty-list";

/** What a section shows when it has nothing yet. */
export function SectionEmpty({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <EmptyList hasBorder className="py-8 gap-3">
      <EmptyListHeader className="gap-3">
        <EmptyListIcon className="size-10 [&_svg]:size-5">{icon}</EmptyListIcon>
        <EmptyListContent>
          <EmptyListTitle className="text-base">{title}</EmptyListTitle>
          <EmptyListDescription className="text-sm">{description}</EmptyListDescription>
        </EmptyListContent>
      </EmptyListHeader>
    </EmptyList>
  );
}
