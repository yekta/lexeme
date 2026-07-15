"use client";

import { FormFieldWrapper } from "@/components/form";
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
import { useEffect, useMemo } from "react";

type TLearningProfile = NonNullable<
  ReturnType<typeof useLearningProfiles>["data"]
>[number];

export function LearningProfileField({
  profiles,
  isPending,
  value,
  onChange,
  fallbackId,
}: {
  profiles: TLearningProfile[] | undefined;
  isPending: boolean;
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

  useEffect(() => {
    if (isPending) return;
    if (!fallbackId) return;
    if (value && profileOptions.some((o) => o.value === value)) return;
    if (!profileOptions.some((o) => o.value === fallbackId)) return;

    onChange(fallbackId);
  }, [fallbackId, isPending, onChange, profileOptions, value]);

  return (
    <FormFieldWrapper>
      <Label>Learning Profile</Label>
      <Combobox
        isPlaceholder={isPending}
        isPlaceholderText="Default"
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
        <ComboboxInput
          placeholder="Search profiles..."
          className="-mx-1 w-[calc(100%+0.5rem)]"
        />
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
      <p className="text-xs text-muted-foreground">
        Controls daily limits and learning parameters.
      </p>
    </FormFieldWrapper>
  );
}
