import { cn } from "@/lib/utils";

type TProps = {
  children: React.ReactNode;
  className?: string;
};

export function FormWrapper({ children, className }: TProps) {
  return (
    <div className={cn("w-full flex flex-col py-4 gap-5", className)}>
      {children}
    </div>
  );
}

export function FormFieldWrapper({ children, className }: TProps) {
  return (
    <div className={cn("w-full flex flex-col gap-2.5", className)}>
      {children}
    </div>
  );
}
