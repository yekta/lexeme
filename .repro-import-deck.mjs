// Repro 2: importDeck-shaped transaction (decks + cards collections in one tx),
// then a simulated tab-reload replay from the outbox.
// Usage: node .repro-import-deck.mjs [N]
import { performance } from "node:perf_hooks";
import { createCollection, createLiveQueryCollection, eq } from "@tanstack/db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { QueryClient } from "@tanstack/query-core";
import { startOfflineExecutor } from "@tanstack/offline-transactions";

const N = Number(process.argv[2] ?? 1500);
const DECK_ID = crypto.randomUUID();
const queryClient = new QueryClient();
const now = new Date();

const newCardRow = (i) => ({
  id: crypto.randomUUID(),
  deck_id: DECK_ID,
  due: now,
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 0,
  reps: 0,
  lapses: 0,
  state: "new",
  learning_steps: 0,
  last_review: null,
  created_at: now,
  updated_at: now,
  front: "front word " + i,
  back: "back definition that is a bit longer " + i,
  content_updated_at: now,
});

let serverCards = [];
const cardsCollection = createCollection(
  queryCollectionOptions({
    id: "cards",
    queryKey: ["cards"],
    queryFn: async () => serverCards,
    queryClient,
    staleTime: Infinity,
    getKey: (r) => r.id,
  }),
);
let serverDecks = [];
const decksCollection = createCollection(
  queryCollectionOptions({
    id: "decks",
    queryKey: ["decks"],
    queryFn: async () => serverDecks,
    queryClient,
    staleTime: Infinity,
    getKey: (r) => r.id,
  }),
);

const store = new Map();
const storage = {
  async get(k) {
    return store.get(k) ?? null;
  },
  async set(k, v) {
    store.set(k, v);
  },
  async delete(k) {
    store.delete(k);
  },
  async keys() {
    return [...store.keys()];
  },
};

let t0 = performance.now();
const mark = (name) =>
  console.log(
    "[" + (performance.now() - t0).toFixed(0).padStart(7) + "ms]",
    name,
  );

// Set SIMULATE_OFFLINE_CRASH=1 to make the first server call hang forever so
// the outbox entry survives, then we "reload the tab" with a second executor.
const simulateCrash = process.env.SIMULATE_OFFLINE_CRASH === "1";
let firstCall = true;

const mutationFns = {
  importDeck: async ({ transaction }) => {
    mark("mutationFn start (mutations=" + transaction.mutations.length + ")");
    if (simulateCrash && firstCall) {
      firstCall = false;
      mark("simulating crash: server call never resolves");
      await new Promise(() => {});
    }
    const deckMuts = transaction.mutations.filter(
      (m) => m.collection.id === "decks",
    );
    const cardMuts = transaction.mutations.filter(
      (m) => m.collection.id === "cards",
    );
    await new Promise((r) => setTimeout(r, 50)); // fake server
    mark("server responded; writeUpsert start");
    const serverNow = new Date(Date.now());
    serverDecks = deckMuts.map((m) => ({ ...m.modified, created_at: serverNow }));
    serverCards = cardMuts.map((m) => ({
      ...m.modified,
      created_at: serverNow,
      updated_at: serverNow,
      due: serverNow,
      content_updated_at: serverNow,
    }));
    if (deckMuts[0]) decksCollection.utils.writeUpsert(deckMuts[0].modified);
    if (cardMuts.length > 0)
      cardsCollection.utils.writeUpsert(cardMuts.map((m) => m.modified));
    mark("writeUpsert done");
  },
};

const makeExecutor = () =>
  startOfflineExecutor({
    collections: { cards: cardsCollection, decks: decksCollection },
    mutationFns,
    storage,
    leaderElection: {
      requestLeadership: async () => true,
      releaseLeadership() {},
      isLeader: () => true,
      onLeadershipChange: () => () => {},
    },
    onlineDetector: {
      isOnline: () => true,
      subscribe: () => () => {},
      dispose() {},
    },
  });

const executor = makeExecutor();
await executor.waitForInit();
await cardsCollection.preload();
await decksCollection.preload();

const deckCards = createLiveQueryCollection((q) =>
  q
    .from({ card: cardsCollection })
    .where(({ card }) => eq(card.deck_id, DECK_ID)),
);
const allDecks = createLiveQueryCollection((q) =>
  q.from({ deck: decksCollection }),
);
await deckCards.preload();
await allDecks.preload();

const rows = Array.from({ length: N }, (_, i) => newCardRow(i));

const action = executor.createOfflineAction({
  mutationFnName: "importDeck",
  onMutate: (v) => {
    decksCollection.insert({
      id: DECK_ID,
      name: v.name,
      description: "",
      learning_profile_id: "p",
      created_at: now,
    });
    cardsCollection.insert(v.cardRows);
  },
});

const checkSynced = () => {
  let unsyncedCards = 0;
  for (const row of deckCards.values()) {
    if (row.$synced === false) unsyncedCards++;
  }
  let unsyncedDecks = 0;
  for (const row of allDecks.values()) {
    if (row.$synced === false) unsyncedDecks++;
  }
  return { unsyncedCards, unsyncedDecks, outbox: store.size };
};

console.log("--- importDeck with", N, "cards, crash=" + simulateCrash, "---");
t0 = performance.now();
const tx = action({ name: "My Deck", cardRows: rows });
mark("action returned (optimistic applied)");

if (!simulateCrash) {
  await tx.isPersisted.promise;
  mark("isPersisted resolved");
  await new Promise((r) => setTimeout(r, 250));
  mark("settled: " + JSON.stringify(checkSynced()));
} else {
  // wait for the outbox write, then "reload": fresh executor over same storage
  await new Promise((r) => setTimeout(r, 300));
  mark("pre-reload: " + JSON.stringify(checkSynced()));
  executor.dispose();
  mark("tab reloaded; starting replay executor");
  const executor2 = makeExecutor();
  // --- new startOutboxReplay logic from src/db/offline.ts ---
  await executor2.waitForInit();
  const queued = await executor2.peekOutbox();
  mark("replay init done; queued tx = " + queued.length);
  const touched = new Set();
  for (const qtx of queued) for (const m of qtx.mutations) touched.add(m.collection.id);
  while (executor2.getPendingCount() > 0) {
    await new Promise((r) => setTimeout(r, 100));
  }
  mark("outbox drained: " + JSON.stringify(checkSynced()));
  const byId = { cards: cardsCollection, decks: decksCollection };
  for (const id of touched) await byId[id]?.utils.refetch();
  await new Promise((r) => setTimeout(r, 300));
  mark("after refetch: " + JSON.stringify(checkSynced()));
}
process.exit(0);
