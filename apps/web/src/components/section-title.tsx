export function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
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
}
