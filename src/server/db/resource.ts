type Closeable = {
  close: () => Promise<unknown>;
};

/** Run work with a fresh resource and release it regardless of the outcome. */
export async function withRequestResource<TResource extends Closeable, TResult>(
  create: () => TResource,
  run: (resource: TResource) => Promise<TResult>,
): Promise<TResult> {
  const resource = create();
  try {
    return await run(resource);
  } finally {
    await resource.close();
  }
}

/**
 * Keep a request resource alive until a streaming response is finished.
 *
 * A Fetch `Response` can be returned before its body producer has completed.
 * tRPC's batch-stream transport does exactly that, and its procedures may keep
 * querying while chunks are produced. Closing Postgres when the Response
 * object is created races those queries. Wrapping the body makes completion or
 * cancellation—not Response construction—the resource boundary.
 */
export async function withRequestResourceResponse<
  TResource extends Closeable,
>(
  create: () => TResource,
  run: (resource: TResource) => Promise<Response>,
): Promise<Response> {
  const resource = create();
  let closePromise: Promise<void> | undefined;
  const close = () => {
    closePromise ??= Promise.resolve()
      .then(() => resource.close())
      .then(() => undefined);
    return closePromise;
  };

  try {
    const response = await run(resource);
    if (!response.body) {
      await close();
      return response;
    }

    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            await close();
            controller.close();
            return;
          }
          controller.enqueue(chunk.value);
        } catch (error) {
          await close().catch(() => undefined);
          controller.error(error);
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          await close();
        }
      },
    });

    return new Response(body, response);
  } catch (error) {
    await close();
    throw error;
  }
}
