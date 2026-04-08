import { cn } from "@/lib/utils";
import { ComponentProps } from "react";

export default function Logo({ className, style }: ComponentProps<"svg">) {
  return (
    <div style={style} className={cn("size-7 shrink-0 relative", className)}>
      <svg
        style={style}
        className="size-full shrink-0 absolute left-0 top-0 opacity-0 dark:opacity-100"
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
      <svg
        style={style}
        className="size-full shrink-0 absolute left-0 top-0 opacity-100 dark:opacity-0"
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M24 0C26.2091 0 28 1.79086 28 4V24C28 26.2091 26.2091 28 24 28H4C1.79086 28 6.44266e-08 26.2091 0 24V4C0 1.79086 1.79086 9.66384e-08 4 0H24ZM2 7V16H26V7H2ZM9.5 9C10.8807 9 12 10.1193 12 11.5C12 12.8807 10.8807 14 9.5 14C8.11929 14 7 12.8807 7 11.5C7 10.1193 8.11929 9 9.5 9ZM18.5 9C19.8807 9 21 10.1193 21 11.5C21 12.8807 19.8807 14 18.5 14C17.1193 14 16 12.8807 16 11.5C16 10.1193 17.1193 9 18.5 9Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
