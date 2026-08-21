import { cn } from "@/lib/utils";
import { RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";

type TProps = { isOptimistic: boolean; className?: string };

export default function OptimisticIndicator({
  isOptimistic,
  className,
}: TProps) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (isOptimistic) {
      setAnimate(true);
      return;
    }
    const timeout = setTimeout(() => setAnimate(false), 1000);
    return () => clearTimeout(timeout);
  }, [isOptimistic]);

  return (
    <RefreshCwIcon
      data-optimistic={isOptimistic || undefined}
      data-animate={animate || undefined}
      className={cn(
        "shrink-0 opacity-0 data-optimistic:opacity-100 scale-50 data-optimistic:scale-100 data-animate:animate-spin transition size-5 text-muted-more-foreground",
        className,
      )}
    />
  );
}
