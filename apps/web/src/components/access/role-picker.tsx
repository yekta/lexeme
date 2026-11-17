import { ACCESS_ROLES, type TAccessRole } from "@lexeme/shared";
import { CheckIcon, EyeIcon, ShieldHalfIcon, SquarePenIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export const ROLE_META: Record<
  TAccessRole,
  { label: string; description: string; Icon: React.ElementType }
> = {
  viewer: {
    label: "Viewer",
    description: "Can read decks, cards and learning profiles.",
    Icon: EyeIcon,
  },
  editor: {
    label: "Editor",
    description: "Can also create and edit them, add cards and study.",
    Icon: SquarePenIcon,
  },
  admin: {
    label: "Admin",
    description: "Can also delete decks, cards and learning profiles.",
    Icon: ShieldHalfIcon,
  },
};

export function RolePicker({
  value,
  onChange,
}: {
  value: TAccessRole;
  onChange: (role: TAccessRole) => void;
}) {
  return (
    <div role="radiogroup" className="-mx-1 w-[calc(100%+0.5rem)] flex flex-col gap-1.5">
      {ACCESS_ROLES.map((role) => {
        const { label, description, Icon } = ROLE_META[role];
        const isSelected = role === value;
        return (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(role)}
            className={cn(
              "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 hover:bg-muted active:bg-muted",
              isSelected && "border-foreground/40 bg-muted",
            )}
          >
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <CheckIcon
              className={cn("size-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
            />
          </button>
        );
      })}
    </div>
  );
}

export function RoleBadge({ role }: { role: TAccessRole }) {
  const { label, Icon } = ROLE_META[role];
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}
