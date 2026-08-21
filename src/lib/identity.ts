"use client";

/**
 * Who this device is signed in as, remembered across launches.
 *
 * The whole point of a local-first build is that signing in once is enough:
 * after that the archive is on the device, and needing a round trip to a
 * session endpoint before anything can render would put the network back on the
 * critical path it was just taken off. So the identity is cached here, and a
 * failed session probe is read as "offline", not as "signed out" — the app
 * opens from the local store either way and syncing catches up later.
 *
 * Only an explicit sign-out clears this (along with the local Zero store), so a
 * shared device can't hand the next person the previous one's decks.
 *
 * It holds no credential. The session cookie is httpOnly and stays where the
 * browser put it; this is a name and an avatar so the app can draw itself, plus
 * the user id every query and mutation is scoped by. A tampered id buys
 * nothing: the server derives its own from the verified session and ignores
 * whatever the client claims.
 */

const KEY = "lexeme:identity";

export type TIdentity = {
  id: string;
  email: string;
  image: string | null;
};

export function loadIdentity(): TIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TIdentity>;
    if (typeof parsed.id !== "string" || typeof parsed.email !== "string") {
      return null;
    }
    return { id: parsed.id, email: parsed.email, image: parsed.image ?? null };
  } catch {
    // Unparseable, or storage blocked in a private window. No identity is a
    // perfectly good answer: the sign-in screen is the fallback.
    return null;
  }
}

export function saveIdentity(identity: TIdentity): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    // Private mode or quota. The app still works for this session; it just
    // won't open straight into the archive next time.
  }
}

export function clearIdentity(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
