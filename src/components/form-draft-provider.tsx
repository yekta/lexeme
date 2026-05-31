"use client";

import {
  useForm,
  type FormAsyncValidateOrFn,
  type FormOptions,
  type FormValidateOrFn,
  type ReactFormExtendedApi,
} from "@tanstack/react-form";
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * In-memory draft store for forms. Keyed by `${id}::${instanceId}`, it survives
 * a form being unmounted (dialog closed, navigation) for the page session, and
 * is wiped on a full reload. This is what stops forms from losing their values
 * when they're closed.
 */
type DraftStore = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  clear: (key: string) => void;
};

const FormDraftContext = createContext<DraftStore | null>(null);

export function FormDraftProvider({ children }: { children: ReactNode }) {
  // A ref, not state — writing a draft on every keystroke must never re-render
  // the tree. Forms write here while mounted and read once when they remount.
  const store = useRef(new Map<string, unknown>());

  const value = useMemo<DraftStore>(
    () => ({
      get: (key) => store.current.get(key),
      set: (key, v) => void store.current.set(key, v),
      clear: (key) => void store.current.delete(key),
    }),
    [],
  );

  return (
    <FormDraftContext.Provider value={value}>
      {children}
    </FormDraftContext.Provider>
  );
}

function useFormDraftStore() {
  const ctx = useContext(FormDraftContext);
  if (!ctx) {
    throw new Error("usePersistentForm must be used within a FormDraftProvider");
  }
  return ctx;
}

/**
 * A drop-in replacement for `useForm` that persists its draft across unmounts,
 * so a form keeps its values when its dialog is closed and reopened.
 *
 * It takes the exact same options as `useForm` plus two persistence keys, and
 * returns the exact same form API — define `validators`, `listeners`, etc. as
 * usual. Give multi-instance forms (e.g. one AddCardForm per deck) an
 * `instanceId` so each keeps its own draft.
 */
export function usePersistentForm<
  TFormData,
  TOnMount extends undefined | FormValidateOrFn<TFormData>,
  TOnChange extends undefined | FormValidateOrFn<TFormData>,
  TOnChangeAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnBlur extends undefined | FormValidateOrFn<TFormData>,
  TOnBlurAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnSubmit extends undefined | FormValidateOrFn<TFormData>,
  TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnDynamic extends undefined | FormValidateOrFn<TFormData>,
  TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<TFormData>,
  TOnServer extends undefined | FormAsyncValidateOrFn<TFormData>,
  TSubmitMeta,
>(
  opts: FormOptions<
    TFormData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TOnServer,
    TSubmitMeta
  > & {
    /** Stable id for this form type, e.g. "add-card". */
    id: string;
    /** Distinguishes instances of the same form, e.g. a deck or card id. */
    instanceId?: string;
  },
): ReactFormExtendedApi<
  TFormData,
  TOnMount,
  TOnChange,
  TOnChangeAsync,
  TOnBlur,
  TOnBlurAsync,
  TOnSubmit,
  TOnSubmitAsync,
  TOnDynamic,
  TOnDynamicAsync,
  TOnServer,
  TSubmitMeta
> {
  const { id, instanceId, ...formOptions } = opts;
  const store = useFormDraftStore();
  const key = `${id}::${instanceId ?? "_"}`;

  // Read any saved draft once, on mount. A partially-filled draft is restored
  // as-is (no strict parse) so half-typed forms survive.
  const [initialValues] = useState<TFormData | undefined>(
    () => (store.get(key) as TFormData | undefined) ?? formOptions.defaultValues,
  );

  const mergedOptions: typeof formOptions = {
    ...formOptions,
    defaultValues: initialValues,
    // Persist on every field change so the latest values survive an unmount,
    // while still running any caller-provided onChange listener.
    listeners: {
      ...formOptions.listeners,
      onChange: (props) => {
        store.set(key, props.formApi.state.values);
        formOptions.listeners?.onChange?.(props);
      },
    },
    // Wipe the draft only after a successful submit.
    onSubmit: async (props) => {
      const result = await formOptions.onSubmit?.(props);
      store.clear(key);
      return result;
    },
  };

  return useForm(mergedOptions);
}
