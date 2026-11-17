import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  isAllowedRedirectUri,
  redirectUriMatches,
  sameResource,
  verifyPkceS256,
} from "./rules.ts";

describe("isAllowedRedirectUri", () => {
  it("allows https, loopback http and known app schemes", () => {
    assert.equal(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback"), true);
    assert.equal(isAllowedRedirectUri("http://localhost:6274/callback"), true);
    assert.equal(isAllowedRedirectUri("http://127.0.0.1:33418/"), true);
    assert.equal(isAllowedRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback"), true);
  });

  it("refuses plain http elsewhere, fragments, unknown schemes and garbage", () => {
    assert.equal(isAllowedRedirectUri("http://evil.example/callback"), false);
    assert.equal(isAllowedRedirectUri("https://claude.ai/callback#frag"), false);
    assert.equal(isAllowedRedirectUri("javascript:alert(1)"), false);
    assert.equal(isAllowedRedirectUri("not a url"), false);
  });
});

describe("redirectUriMatches", () => {
  const registered = ["https://claude.ai/api/mcp/auth_callback", "http://localhost:5000/callback"];

  it("matches registered URIs exactly", () => {
    assert.equal(redirectUriMatches(registered, "https://claude.ai/api/mcp/auth_callback"), true);
    assert.equal(redirectUriMatches(registered, "https://claude.ai/api/mcp/other"), false);
  });

  it("ignores the port on loopback redirects only", () => {
    assert.equal(redirectUriMatches(registered, "http://localhost:61234/callback"), true);
    assert.equal(redirectUriMatches(registered, "http://localhost:61234/other"), false);
    assert.equal(redirectUriMatches(registered, "http://127.0.0.1:5000/callback"), false);
    assert.equal(redirectUriMatches(registered, "https://claude.ai:444/api/mcp/auth_callback"), false);
  });
});

describe("verifyPkceS256", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  it("accepts the verifier that produced the challenge", () => {
    assert.equal(verifyPkceS256(verifier, challenge), true);
  });

  it("rejects a different verifier or a malformed one", () => {
    assert.equal(verifyPkceS256(`${verifier.slice(0, -1)}Y`, challenge), false);
    assert.equal(verifyPkceS256("short", challenge), false);
  });
});

describe("sameResource", () => {
  it("treats a trailing slash as the same resource", () => {
    assert.equal(sameResource("https://api.lexeme.fyi/mcp/", "https://api.lexeme.fyi/mcp"), true);
    assert.equal(sameResource("https://api.lexeme.fyi/other", "https://api.lexeme.fyi/mcp"), false);
  });
});
