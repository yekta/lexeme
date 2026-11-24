import type { ComponentProps, ReactNode } from "react";

import { Navbar } from "@/components/navbar";
import { cn } from "@/lib/utils";

type TPageProps = ComponentProps<typeof Navbar> & {
  isPlaceholder?: boolean;
  className?: string;
  children: ReactNode;
};

export function Page({ isPlaceholder, className, children, ...navbarProps }: TPageProps) {
  return (
    <div
      data-placeholder={isPlaceholder || undefined}
      className="min-h-screen relative group flex flex-col"
    >
      <Navbar {...navbarProps} />
      <main className={cn("w-full max-w-5xl mx-auto px-5 pt-6 pb-16 flex-1 flex flex-col", className)}>
        {children}
      </main>
    </div>
  );
}
