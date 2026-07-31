/// <reference lib="webworker" />
import init, { Fsrs, initThreadPool } from "fsrs-browser";

export type TTrainRequest = {
  ratings: Uint32Array;
  deltaTs: Uint32Array;
  lengths: Uint32Array;
  enableShortTerm: boolean;
  numRelearningSteps: number;
};

export type TTrainResponse =
  | { ok: true; w: number[] }
  | { ok: false; error: string };

// A Rust panic reaches JS only as `unreachable`; the real message goes to
// console.error via the panic hook. Intercept it so failures are diagnosable.
let lastPanic: string | undefined;
const forwardError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const text = args.map((a) => String(a)).join(" ");
  if (text.includes("panicked at")) {
    lastPanic = text.split("\n").slice(0, 2).join(" ").trim();
  }
  forwardError(...args);
};

/** Rayon spawns this many workers; more than a few gives little back and
 * competes with the UI thread on modest devices. */
const MAX_THREADS = 4;

let ready: Promise<void> | undefined;

function ensureReady(): Promise<void> {
  ready ??= (async () => {
    await init();
    const threads = Math.max(
      1,
      Math.min(navigator.hardwareConcurrency || 2, MAX_THREADS),
    );
    await initThreadPool(threads);
  })();
  return ready;
}

self.onmessage = async (event: MessageEvent<TTrainRequest>) => {
  const request = event.data;
  lastPanic = undefined;
  try {
    await ensureReady();
    const fsrs = new Fsrs();
    const w = fsrs.computeParameters(
      request.ratings,
      request.deltaTs,
      request.lengths,
      undefined,
      request.enableShortTerm,
      undefined,
      request.numRelearningSteps,
    );
    fsrs.free();
    const response: TTrainResponse = { ok: true, w: Array.from(w) };
    self.postMessage(response);
  } catch (error) {
    const response: TTrainResponse = {
      ok: false,
      error:
        lastPanic ?? (error instanceof Error ? error.message : String(error)),
    };
    self.postMessage(response);
  }
};
