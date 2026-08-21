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
