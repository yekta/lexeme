import assert from "node:assert/strict";
import { test } from "node:test";

import { withRequestResource } from "./resource.ts";

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
