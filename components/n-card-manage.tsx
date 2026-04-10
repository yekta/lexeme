"use client";

import Dots from "@/components/dots";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";

type TNCardManageProps =
  | { isPlaceholder: true }
  | {
      isPlaceholder?: never;
      id: string;
      front: string;
      back: string;
      onEdit: () => void;
      onDelete: () => void;
    };

export function NCardManage(props: TNCardManageProps) {
  const { isPlaceholder } = props;

  const front = isPlaceholder ? "This is the front of the card" : props.front;
  const back = isPlaceholder ? "This is the back of the card" : props.back;

  return (
    <div
      className="group relative rounded-xl border border-border bg-card shadow-md overflow-hidden group-data-placeholder:border-skeleton"
      data-placeholder={isPlaceholder || undefined}
      style={{
        boxShadow: "0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
      }}
    >
      <Dots />
      {/* Menu */}
      {!isPlaceholder && (
        <div className="absolute top-1 right-1 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-lg text-sm font-medium hover:bg-accent size-9 shrink-0 focus-visible:outline-none">
              <MoreVertical className="size-5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={props.onEdit}
              >
                <Pencil className="h-4 w-4" />
                Edit Card
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="cursor-pointer"
                onClick={props.onDelete}
              >
                <Trash2 className="h-4 w-4" />
                Delete Card
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Front */}
      <div className="px-5 py-4 w-full flex flex-col items-start relative bg-card gap-2">
        <p className="shrink max-w-full pr-5 min-w-0 overflow-hidden overflow-ellipsis text-xs font-semibold uppercase tracking-wider text-muted-foreground group-data-placeholder:text-transparent group-data-placeholder:bg-skeleton group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:w-10 group-data-placeholder:select-none">
          Front
        </p>
        <p className="shrink max-w-full min-w-0 text-sm text-foreground line-clamp-3 break-words font-medium leading-relaxed group-data-placeholder:text-transparent group-data-placeholder:bg-skeleton group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
          {front}
        </p>
      </div>

      {/* Divider — ruled line style */}
      <div className="w-full h-px bg-border relative z-10" />

      {/* Back */}
      <div className="px-5 py-4 relative w-full flex flex-col items-start gap-2">
        <p className="shrink max-w-full pr-5 min-w-0 overflow-hidden overflow-ellipsis text-xs font-semibold uppercase tracking-wider text-muted-foreground group-data-placeholder:text-transparent group-data-placeholder:bg-skeleton group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:w-10 group-data-placeholder:select-none">
          Back
        </p>
        <p className="shrink max-w-full min-w-0 text-sm text-foreground/80 line-clamp-3 break-words leading-relaxed group-data-placeholder:text-transparent group-data-placeholder:bg-skeleton group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
          {back}
        </p>
      </div>
    </div>
  );
}
