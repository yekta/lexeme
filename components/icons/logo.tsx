import { cn } from "@/lib/utils";
import { ComponentProps } from "react";

export default function Logo({ className, style }: ComponentProps<"svg">) {
  return (
    <svg
      className={cn("size-8 shrink-0", className)}
      style={style}
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M26 0C29.3137 0 32 2.68629 32 6V26C32 29.3137 29.3137 32 26 32H6L5.69141 31.9922C2.52111 31.8316 0 29.2102 0 26V6C0 2.68629 2.68629 0 6 0H26ZM6 2C3.79086 2 2 3.79086 2 6V26C2 28.2091 3.79086 30 6 30H26C28.2091 30 30 28.2091 30 26V6C30 3.79086 28.2091 2 26 2H6ZM28 18H4V9H28V18ZM11.5 11C10.1193 11 9 12.1193 9 13.5C9 14.8807 10.1193 16 11.5 16C12.8807 16 14 14.8807 14 13.5C14 12.1193 12.8807 11 11.5 11ZM20.5 11C19.1193 11 18 12.1193 18 13.5C18 14.8807 19.1193 16 20.5 16C21.8807 16 23 14.8807 23 13.5C23 12.1193 21.8807 11 20.5 11Z"
        fill="currentColor"
      />
    </svg>
  );
}
