import { okResponse, queries, sendBookResponse, type TSentBookRow } from "@lexeme/contracts";
import { useQuery } from "@rocicorp/zero/react";
import { useMutation } from "@tanstack/react-query";

import { apiDelete, apiUpload } from "@/lib/api";
import { useZeroStatus } from "@/zero/status";

export type TSentBook = TSentBookRow;

/** Books sent to the e-readers; a row's `delivered_at` fills in once a device has it. */
export function useSentBooks() {
  const [books, details] = useQuery(queries.sentBooks());
  return { books, ...useZeroStatus(books.length > 0, details) };
}

export function useSendBook() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiUpload("/api/books", sendBookResponse, form);
    },
  });
}

export function useUnsendBook() {
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/books/${id}`, okResponse),
  });
}
