import { LinkButton } from "@/components/ui/button";

export function SectionTitle({ title, count, seeAllHref }: { title: string; count?: number; seeAllHref?: string }) {
  const heading = (
    <h2 className="mx-1 text-2xl font-bold tracking-tight truncate min-w-0">
      {title}
      {count !== undefined && (
        <>
          {" "}
          <span className="font-normal text-xl text-muted-foreground">({count})</span>
        </>
      )}
    </h2>
  );
  if (!seeAllHref) return heading;
  return (
    <div className="flex items-center justify-between gap-4">
      {heading}
      <LinkButton variant="ghost" size="sm" href={seeAllHref} className="shrink-0">
        See all
      </LinkButton>
    </div>
  );
}
