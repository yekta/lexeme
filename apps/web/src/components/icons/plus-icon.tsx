import { cn } from "@/lib/utils";
import { ComponentProps } from "react";

export default function PlusIcon({ className, style }: ComponentProps<"svg">) {
  return (
    <svg
      style={style}
      className={cn("size-5 shrink-0 relative", className)}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 5V12M12 19V12M12 12H5M12 12H19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
