"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { useLearningProfiles } from "@/hooks/data/use-learning-profiles";
import { useMemo } from "react";

type TLearningProfile = NonNullable<
  ReturnType<typeof useLearningProfiles>["data"]
>[number];

export function LearningProfileField({
  profiles,
  isLoading,
  value,
  onChange,
  fallbackId,
}: {
  profiles: TLearningProfile[] | undefined;
  isLoading: boolean;
  value: string;
  onChange: (id: string) => void;
  fallbackId: string | undefined;
}) {
  const profileOptions = useMemo(
    () => (profiles ?? []).map((p) => ({ value: p.id, label: p.name })),
    [profiles],
  );
  const selected = useMemo(
    () => profileOptions.find((o) => o.value === value) ?? null,
    [profileOptions, value],
  );

  return (
    <div className="w-full flex flex-col gap-2">
      <Label>Learning Profile</Label>
      {isLoading ? (
        <div className="h-10 w-full rounded-lg bg-skeleton animate-pulse" />
      ) : (
        <Combobox
          items={profileOptions}
          itemToStringValue={(i) => i.label}
          value={selected}
          onValueChange={(val) => {
            onChange(val?.value ?? fallbackId ?? "");
          }}
          onOpenChangeComplete={(open) => {
            if (open) return;
            if (value && profileOptions.some((o) => o.value === value)) return;
            if (!fallbackId) return;
            onChange(fallbackId);
          }}
        >
          <ComboboxInput placeholder="Search profiles..." className="w-full" />
          <ComboboxContent>
            <ComboboxEmpty>No profiles found.</ComboboxEmpty>
            <ComboboxList>
              {(item: (typeof profileOptions)[number]) => (
                <ComboboxItem key={item.value} value={item}>
                  {item.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      )}
      <p className="text-xs text-muted-foreground">
        Controls daily limits and learning parameters.
      </p>
    </div>
  );
}
