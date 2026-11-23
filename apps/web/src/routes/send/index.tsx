import { MAX_SENT_BOOK_BYTES, SENDABLE_BOOK_EXTENSIONS } from "@lexeme/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { BookUpIcon, CheckIcon, LoaderCircleIcon, Trash2Icon } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import {
  EmptyList,
  EmptyListContent,
  EmptyListDescription,
  EmptyListHeader,
  EmptyListIcon,
  EmptyListTitle,
} from "@/components/empty-list";
import { LoadError } from "@/components/load-error";
import { Navbar } from "@/components/navbar";
import { RequireIdentity } from "@/components/require-identity";
import { SectionTitle } from "@/components/section-title";
import { SettlingSkeleton } from "@/components/settling-skeleton";
import { Button } from "@/components/ui/button";
import { useSendBook, useSentBooks, useUnsendBook, type TSentBook } from "@/hooks/data/use-sent-books";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/send/")({
  component: SendRoute,
});

function SendRoute() {
  return (
    <RequireIdentity
      fallback={
        <SettlingSkeleton>
          <Navbar />
        </SettlingSkeleton>
      }
    >
      <SendPage />
    </RequireIdentity>
  );
}

const ACCEPT = SENDABLE_BOOK_EXTENSIONS.map((ext) => `.${ext}`).join(",");

function SendPage() {
  const sent = useSentBooks();
  const send = useSendBook();
  const unsend = useUnsendBook();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function sendFiles(files: FileList | null) {
    for (const file of Array.from(files ?? [])) {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!(SENDABLE_BOOK_EXTENSIONS as readonly string[]).includes(extension)) {
        toast.error(`${file.name} isn't a book file your Kindle can open.`);
        continue;
      }
      if (file.size > MAX_SENT_BOOK_BYTES) {
        toast.error(`${file.name} is over 100 MB.`);
        continue;
      }
      await send.mutateAsync(file).then(
        () => toast.success(`Sent ${file.name}. Your Kindle gets it next time it syncs.`),
        (error: Error) => toast.error(error.message),
      );
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void sendFiles(event.dataTransfer.files);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar title="Send to Kindle" backHref="/" />
      <main className="w-full max-w-3xl mx-auto px-5 pt-6 pb-16 flex-1 flex flex-col gap-8">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "rounded-xl border-2 border-dashed px-6 py-10 flex flex-col items-center gap-2 text-center transition-colors",
            dragging ? "border-primary bg-accent" : "hover:bg-accent/50",
          )}
        >
          {send.isPending ? (
            <LoaderCircleIcon className="size-8 animate-spin text-muted-foreground" />
          ) : (
            <BookUpIcon className="size-8 text-muted-foreground" />
          )}
          <span className="font-medium">{send.isPending ? "Sending…" : "Drop books here, or choose files"}</span>
          <span className="text-sm text-muted-foreground">
            Your Kindle downloads them the next time it syncs.
          </span>
        </button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            void sendFiles(event.target.files);
            event.target.value = "";
          }}
        />

        {sent.isError ? (
          <LoadError error={sent.error} onRetry={sent.refetch} />
        ) : !sent.isPending && sent.books.length === 0 ? (
          <EmptyList>
            <EmptyListHeader>
              <EmptyListIcon>
                <BookUpIcon />
              </EmptyListIcon>
              <EmptyListContent>
                <EmptyListTitle>Nothing sent yet</EmptyListTitle>
                <EmptyListDescription>Books you send show up here until your Kindle has them.</EmptyListDescription>
              </EmptyListContent>
            </EmptyListHeader>
          </EmptyList>
        ) : (
          <section className="flex flex-col gap-3">
            <SectionTitle title="Sent books" count={sent.books.length} />
            <div className="rounded-xl border divide-y">
              {sent.books.map((book) => (
                <SentBookRow
                  key={book.id}
                  book={book}
                  removing={unsend.isPending && unsend.variables === book.id}
                  onRemove={() =>
                    unsend.mutate(book.id, { onError: (error) => toast.error(error.message) })
                  }
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function SentBookRow({ book, removing, onRemove }: { book: TSentBook; removing: boolean; onRemove: () => void }) {
  const delivered = book.delivered_at != null;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="font-medium truncate">{book.title}</span>
        <span className="text-xs text-muted-foreground">
          {formatSize(book.size_bytes)} · sent {formatDistanceToNowStrict(book.created_at, { addSuffix: true })}
        </span>
      </div>
      <span
        className={cn(
          "text-xs shrink-0 flex items-center gap-1",
          delivered ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {delivered && <CheckIcon className="size-3.5" />}
        {delivered ? "On your Kindle" : "Waiting for your Kindle"}
      </span>
      <Button variant="ghost" size="icon" aria-label={`Remove ${book.title}`} disabled={removing} onClick={onRemove}>
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );
}
