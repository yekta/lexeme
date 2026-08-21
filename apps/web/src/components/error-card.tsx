import { cn } from "@/lib/utils";

type TProps = {
  error: string;
  className?: string;
};

export default function ErrorCard({ error, className }: TProps) {
  return (
    <div
      className={cn(
        "w-full flex flex-col gap-2 rounded-md border bg-destructive/10 border-destructive/20 px-2.5 py-1.5",
        className,
      )}
    >
      <p className="w-full text-sm text-destructive wrap-break-word">{error}</p>
    </div>
  );
}
