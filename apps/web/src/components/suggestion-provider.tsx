import { GENERATE_CARD_EXCLUDE_FRONTS_LIMIT } from "@lexeme/shared";
import { useGenerateBack, useGenerateCard } from "@/hooks/data/use-ai";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type TSuggestionKind = "card" | "back";

type TSuggestion = { front?: string; back: string };

type TSuggestionState = {
  pendingKind: TSuggestionKind | null;
  error: string | null;
  result: TSuggestion | null;
  suggestedFronts: string[];
};

const EMPTY_STATE: TSuggestionState = {
  pendingKind: null,
  error: null,
  result: null,
  suggestedFronts: [],
};

type TSuggestionStore = {
  get: (key: string) => TSuggestionState;
  subscribe: (key: string, listener: () => void) => () => void;
  update: (
    key: string,
    patch: (prev: TSuggestionState) => TSuggestionState,
  ) => void;
  clear: (key: string) => void;
};

const SuggestionContext = createContext<TSuggestionStore | null>(null);

export function SuggestionProvider({ children }: { children: ReactNode }) {
  const states = useRef(new Map<string, TSuggestionState>());
  const listeners = useRef(new Map<string, Set<() => void>>());

  const value = useMemo<TSuggestionStore>(() => {
    const emit = (key: string) =>
      listeners.current.get(key)?.forEach((listener) => listener());

    return {
      get: (key) => states.current.get(key) ?? EMPTY_STATE,
      subscribe: (key, listener) => {
        let set = listeners.current.get(key);
        if (!set) {
          set = new Set();
          listeners.current.set(key, set);
        }
        set.add(listener);
        return () => {
          set.delete(listener);
          if (set.size === 0) listeners.current.delete(key);
        };
      },
      update: (key, patch) => {
        states.current.set(key, patch(states.current.get(key) ?? EMPTY_STATE));
        emit(key);
      },
      clear: (key) => {
        states.current.delete(key);
        emit(key);
      },
    };
  }, []);

  return (
    <SuggestionContext.Provider value={value}>
      {children}
    </SuggestionContext.Provider>
  );
}

function useSuggestionStore() {
  const ctx = useContext(SuggestionContext);
  if (!ctx) {
    throw new Error(
      "useCardSuggestion must be used within a SuggestionProvider",
    );
  }
  return ctx;
}

export function useCardSuggestion(key: string) {
  const store = useSuggestionStore();
  const generateCard = useGenerateCard();
  const generateBack = useGenerateBack();
  const getSnapshot = useCallback(() => store.get(key), [store, key]);
  const state = useSyncExternalStore(
    useCallback((listener) => store.subscribe(key, listener), [store, key]),
    getSnapshot,
    getSnapshot,
  );

  const run = useCallback(
    async (kind: TSuggestionKind, request: () => Promise<TSuggestion>) => {
      if (store.get(key).pendingKind) return;
      store.update(key, (prev) => ({
        ...prev,
        pendingKind: kind,
        error: null,
      }));
      try {
        const result = await request();
        store.update(key, (prev) => ({
          ...prev,
          pendingKind: null,
          result,
          suggestedFronts: result.front
            ? [...prev.suggestedFronts, result.front].slice(
                -GENERATE_CARD_EXCLUDE_FRONTS_LIMIT,
              )
            : prev.suggestedFronts,
        }));
      } catch (err) {
        store.update(key, (prev) => ({
          ...prev,
          pendingKind: null,
          error:
            err instanceof Error ? err.message : "Couldn't get a suggestion.",
        }));
      }
    },
    [store, key],
  );

  const suggestCard = useCallback(
    (deckId: string) =>
      run("card", () =>
        generateCard.mutateAsync({
          deckId,
          excludeFronts: store.get(key).suggestedFronts,
        }),
      ),
    [run, store, key, generateCard],
  );

  const suggestBack = useCallback(
    (deckId: string, front: string) =>
      run("back", () => generateBack.mutateAsync({ deckId, front })),
    [run, generateBack],
  );

  const takeResult = useCallback(() => {
    const { result } = store.get(key);
    if (!result) return null;
    store.update(key, (prev) => ({ ...prev, result: null }));
    return result;
  }, [store, key]);

  const clear = useCallback(() => store.clear(key), [store, key]);

  return {
    isPendingCard: state.pendingKind === "card",
    isPendingBack: state.pendingKind === "back",
    isPendingAny: state.pendingKind !== null,
    error: state.error,
    result: state.result,
    suggestCard,
    suggestBack,
    takeResult,
    clear,
  };
}
