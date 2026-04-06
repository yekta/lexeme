"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";

interface NCardProps {
  id: string;
  front: string;
  back: string;
  onEdit: () => void;
  onDelete: () => void;
}

export function NCard({ front, back, onEdit, onDelete }: NCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">Front</CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-slate-100 h-8 w-8 shrink-0 focus-visible:outline-none">
            <MoreVertical className="h-4 w-4 text-slate-500" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="cursor-pointer" onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit Card
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Card
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="min-w-0">
        <p className="text-sm text-slate-900 mb-4 line-clamp-3 break-words">
          {front}
        </p>
        <div className="border-t pt-4">
          <h4 className="text-xs font-semibold text-slate-500 uppercase mb-1">
            Back
          </h4>
          <p className="text-sm text-slate-900 line-clamp-3 break-words">
            {back}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
