import { cn } from "@/lib/utils";

type TProps = {
  isNew: boolean;
  className?: string;
  classNameInner?: string;
  classNameBg?: string;
};

export default function NewIndicator({
  isNew,
  className,
  classNameInner,
  classNameBg,
}: TProps) {
  return (
    <>
      <div
        data-new={isNew || undefined}
        className={cn(
          "h-1/2 pointer-events-none opacity-0 data-new:opacity-100 transition duration-500 aspect-square absolute top-0 left-0 bg-gradient-to-br from-success/60 via-success/0 to-success/0 pl-px pt-px",
          className,
        )}
      >
        <div
          className={cn(
            "w-full h-full bg-card rounded-tl-[calc(var(--radius)*1.4-2px)]",
            classNameInner,
          )}
        />
      </div>
      <div
        data-new={isNew || undefined}
        className={cn(
          "h-1/4 aspect-square data-new:opacity-100 opacity-0 bg-success/30 absolute left-0 top-0 blur-2xl translate-[-25%] transition-opacity duration-500 pointer-events-none",
          classNameBg,
        )}
      />
    </>
  );
}
