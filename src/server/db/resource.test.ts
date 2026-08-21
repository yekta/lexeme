import assert from "node:assert/strict";
import { test } from "node:test";

import {
  withRequestResource,
  withRequestResourceResponse,
} from "./resource.ts";

function fakeResource() {
  let closeCalls = 0;
  return {
    get closeCalls() {
      return closeCalls;
    },
    close: async () => {
      closeCalls++;
    },
  };
}

test("withRequestResource creates once and closes after success", async () => {
  const resource = fakeResource();
  let createCalls = 0;

  const result = await withRequestResource(
    () => {
      createCalls++;
      return resource;
    },
    async (value) => {
      assert.equal(value, resource);
      return "response";
    },
  );

  assert.equal(result, "response");
  assert.equal(createCalls, 1);
  assert.equal(resource.closeCalls, 1);
});

test("withRequestResource closes when the request throws", async () => {
  const resource = fakeResource();
  const failure = new Error("request failed");

  await assert.rejects(
    withRequestResource(
      () => resource,
      async () => {
        throw failure;
      },
    ),
    (error) => error === failure,
  );

  assert.equal(resource.closeCalls, 1);
});

test("streaming response keeps the resource open until the body finishes", async () => {
  const resource = fakeResource();
  const encoder = new TextEncoder();
  const response = await withRequestResourceResponse(
    () => resource,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode("first"));
            controller.enqueue(encoder.encode("second"));
            controller.close();
          },
        }),
      ),
  );

  assert.equal(resource.closeCalls, 0);
  assert.equal(await response.text(), "firstsecond");
  assert.equal(resource.closeCalls, 1);
});

test("cancelling a streaming response closes the resource once", async () => {
  const resource = fakeResource();
  const chunk = new TextEncoder().encode("chunk");
  const response = await withRequestResourceResponse(
    () => resource,
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(chunk);
          },
        }),
      ),
  );

  const reader = response.body!.getReader();
  await reader.read();
  assert.equal(resource.closeCalls, 0);
  await reader.cancel("request aborted");
  assert.equal(resource.closeCalls, 1);
});

test("streaming response closes when response setup throws", async () => {
  const resource = fakeResource();
  const failure = new Error("response setup failed");

  await assert.rejects(
    withRequestResourceResponse(
      () => resource,
      async () => {
        throw failure;
      },
    ),
    (error) => error === failure,
  );

  assert.equal(resource.closeCalls, 1);
});
