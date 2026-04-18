import { cn } from "@/lib/utils";

type TProps = {
  className?: string;
};

export default function BgPattern({ className }: TProps) {
  return (
    <div
      className={cn(
        "w-full h-full absolute left-0 top-0 opacity-30 dark:opacity-15 sepia-100 overflow-hidden",
        className,
      )}
    >
      <div className="w-full h-full noise">
        <svg className="absolute w-0 h-0 left-0 top-0 pointer-events-none">
          <filter id="noise" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="turbulence" baseFrequency="0.6" />
          </filter>
        </svg>
      </div>
    </div>
  );
}

{
  /* <div
      style={{
        backgroundColor: "transparent",
        backgroundImage:
          "radial-gradient(var(--dot) 0.5px, transparent 0.5px), radial-gradient(var(--dot) 0.5px, transparent 0.5px)",
        backgroundSize: "8px 8px",
        backgroundPosition: "0 0,4px 4px",
      }}
      className={cn(
        "absolute left-0 top-0 w-full h-full pointer-events-none",
        className,
      )}
    /> */
}
