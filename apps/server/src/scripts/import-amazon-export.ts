// Brings a Kindle's reading history from Amazon's "Request your data" export
// into Lexeme as imported page visits, through the public API's sync-reading.
// Amazon keeps no page numbers, so pages are estimated from each book's page
// count. Rerunning sends the same ids, so it changes nothing.
//
//   pnpm --filter @lexeme/server import:amazon <export-dir> <books.json> [--apply]
//
// books.json lists the books to bring in, by the key KOReader stored for the
// file (partial_md5_checksum in its settings):
//   [{ "key": "...", "title": "...", "pages": 284, "amazon": ["Amazon's product name", ...],
//      "new": true, "authors": "...", "read_to": 124, "finished_on": "2025-11-02" }]
// new marks a book Lexeme doesn't have yet, which authors is for; read_to is
// the page Amazon's reading reached in a book finished elsewhere; finished_on
// overrides the date Amazon marked the book finished.
// LEXEME_API_KEY (an editor key) and LEXEME_URL are needed with --apply.

import { estimatePageReads, type TUnpagedSession } from "@lexeme/shared";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

type TBookEntry = {
  key: string;
  title: string;
  pages: number;
  amazon: string[];
  new?: boolean;
  authors?: string;
  read_to?: number;
  finished_on?: string;
};

type TLexemeBook = { key: string; title: string; status: string };

const PAGE_READS_PER_REQUEST = 2000;

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      rows.push([...row, field.replace(/\r$/, "")]);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  const [header = [], ...records] = rows;
  const names = header.map((name) => name.replace(/^﻿/, ""));
  return records.map((record) => Object.fromEntries(names.map((name, i) => [name, record[i] ?? ""])));
}

async function readCsv(dir: string, file: string) {
  return parseCsv(await readFile(path.join(dir, file), "utf8"));
}

/** The same id the KOReader plugin would mint for the same text. */
function stableId(text: string) {
  const h = createHash("md5").update(text).digest("hex");
  const variant = (8 + (parseInt(h[16] ?? "0", 16) % 4)).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const sameName = (name: string) => name.normalize("NFC").trim();
const localNoon = (day: string) => new Date(`${day}T12:00:00`).getTime();

async function loadExport(dir: string) {
  const [sessions, deviceSessions, completed] = await Promise.all([
    readCsv(
      dir,
      "Kindle.ReadingInsights/datasets/Kindle.reading-insights-sessions_with_adjustments/Kindle.reading-insights-sessions_with_adjustments.csv",
    ),
    readCsv(dir, "Kindle.Devices.ReadingSession/Kindle.Devices.ReadingSession.csv"),
    readCsv(dir, "Kindle.ReadingInsights/datasets/Kindle.UserUniqueTitlesCompleted/Kindle.UserUniqueTitlesCompleted.csv"),
  ]);
  const turnsByMinute = new Map<string, number>();
  for (const session of deviceSessions) {
    const turns = Number(session.number_of_page_flips);
    if (session.number_of_page_flips && Number.isFinite(turns)) {
      turnsByMinute.set(session.start_timestamp?.slice(0, 16) ?? "", turns);
    }
  }
  const finishedOn = new Map<string, string>();
  for (const title of completed) {
    const day = title.asin_date_and_content_type?.split("_")[1];
    if (day) finishedOn.set(sameName(title.product_name ?? ""), day);
  }
  return { sessions, turnsByMinute, finishedOn };
}

function planBook(entry: TBookEntry, data: Awaited<ReturnType<typeof loadExport>>) {
  const names = new Set(entry.amazon.map(sameName));
  const sessions: (TUnpagedSession & { ended_at: number })[] = [];
  for (const session of data.sessions) {
    if (!names.has(sameName(session.product_name ?? ""))) continue;
    const seconds = Math.round(Number(session.total_reading_milliseconds) / 1000);
    if (!(seconds > 0) || !session.start_time) continue;
    sessions.push({
      started_at: new Date(session.start_time).getTime(),
      ended_at: new Date(session.end_time ?? session.start_time).getTime(),
      seconds,
      page_turns: data.turnsByMinute.get(session.start_time.slice(0, 16)) ?? null,
    });
  }
  const finishedDay = entry.finished_on ?? entry.amazon.map((name) => data.finishedOn.get(sameName(name))).find(Boolean);
  const reads = estimatePageReads(sessions, entry.read_to ?? entry.pages).map((read) => ({
    id: stableId(`amazon:${entry.key}:${read.page}:${read.started_at}`),
    book_key: entry.key,
    total_pages: entry.pages,
    imported: true,
    ...read,
  }));
  return {
    entry,
    sessions,
    reads,
    finishedAt: finishedDay ? localNoon(finishedDay) : undefined,
    lastReadAt: Math.max(0, ...sessions.map((session) => session.ended_at)),
  };
}

async function api(baseUrl: string, apiKey: string, method: string, route: string, body?: unknown) {
  const response = await fetch(`${baseUrl}/api/v1${route}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${route} failed (${response.status}): ${text}`);
  return JSON.parse(text) as unknown;
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { apply: { type: "boolean" } } });
  const [exportDir, booksFile] = positionals;
  if (!exportDir || !booksFile) throw new Error("Usage: import-amazon-export <export-dir> <books.json> [--apply]");

  const entries = JSON.parse(await readFile(booksFile, "utf8")) as TBookEntry[];
  const data = await loadExport(exportDir);
  const plans = entries.map((entry) => planBook(entry, data));

  for (const plan of plans) {
    const hours = plan.sessions.reduce((sum, session) => sum + session.seconds, 0) / 3600;
    const finished = plan.finishedAt ? new Date(plan.finishedAt).toISOString().slice(0, 10) : "-";
    console.log(
      `${plan.entry.title.padEnd(40).slice(0, 40)} ${String(plan.sessions.length).padStart(4)} sessions ${hours.toFixed(1).padStart(5)} h ${String(plan.reads.length).padStart(5)} page visits  finished ${finished}`,
    );
  }
  const reads = plans.flatMap((plan) => plan.reads);
  console.log(`${plans.length} books, ${reads.length} page visits`);
  if (!values.apply) return console.log("Dry run; pass --apply to send.");

  const apiKey = process.env.LEXEME_API_KEY;
  if (!apiKey) throw new Error("Set LEXEME_API_KEY to an editor API key.");
  const baseUrl = process.env.LEXEME_URL ?? "https://api.lexeme.fyi";
  const { books: existing } = (await api(baseUrl, apiKey, "GET", "/books")) as { books: TLexemeBook[] };
  const byKey = new Map(existing.map((book) => [book.key, book]));
  const missing = entries.filter((entry) => !entry.new && !byKey.has(entry.key));
  if (missing.length) throw new Error(`Not in Lexeme: ${missing.map((entry) => entry.title).join(", ")}`);

  const books = plans.map(({ entry, finishedAt, lastReadAt }) => {
    const known = byKey.get(entry.key);
    return {
      id: stableId(`book:${entry.key}`),
      key: entry.key,
      title: known?.title ?? entry.title,
      authors: known ? undefined : entry.authors,
      status: finishedAt ? "finished" : (known?.status ?? "reading"),
      progress: finishedAt ? 1 : undefined,
      pages: entry.pages,
      finished_at: finishedAt,
      last_read_at: known ? undefined : lastReadAt,
    };
  });
  await api(baseUrl, apiKey, "POST", "/reading", { books });
  for (let i = 0; i < reads.length; i += PAGE_READS_PER_REQUEST) {
    await api(baseUrl, apiKey, "POST", "/reading", { page_reads: reads.slice(i, i + PAGE_READS_PER_REQUEST) });
    console.log(`Sent ${Math.min(i + PAGE_READS_PER_REQUEST, reads.length)} of ${reads.length} page visits`);
  }
}

await main();
