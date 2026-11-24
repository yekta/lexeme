import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

import { fileNameOfPath, readBookUpload, signBookUpload, uploadCommand } from "./book-uploads.ts";

const SECRET = "a".repeat(32);
const upload = { userId: "user-1", id: "book-1", fileName: "Dune.epub", title: "Dune", expiresAt: 2_000 };

describe("book upload tokens", () => {
  it("reads back what was signed until it expires", () => {
    const token = signBookUpload(upload, SECRET);
    assert.deepEqual(readBookUpload(token, SECRET, 1_000), upload);
    assert.equal(readBookUpload(token, SECRET, 2_000), undefined);
  });

  it("refuses a changed token, another secret and garbage", () => {
    const token = signBookUpload(upload, SECRET);
    const [, sig] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ ...upload, userId: "user-2" })).toString("base64url")}.${sig}`;
    assert.equal(readBookUpload(forged, SECRET, 1_000), undefined);
    assert.equal(readBookUpload(token, "b".repeat(32), 1_000), undefined);
    assert.equal(readBookUpload("not-a-token", SECRET, 1_000), undefined);
  });
});

describe("fileNameOfPath", () => {
  it("takes the last part of a path", () => {
    assert.equal(fileNameOfPath("/Users/me/Books/Dune.epub"), "Dune.epub");
    assert.equal(fileNameOfPath("~/Books/Dune.epub"), "Dune.epub");
    assert.equal(fileNameOfPath("C:\\Books\\Dune.epub"), "Dune.epub");
    assert.equal(fileNameOfPath("Dune.epub"), "Dune.epub");
  });
});

describe("uploadCommand", () => {
  const shellWords = (command: string) =>
    execFileSync("sh", ["-c", `curl() { printf '%s\\n' "$@"; }; ${command.split(" && ")[0]}`], {
      env: { HOME: "/home/me" },
    })
      .toString()
      .trimEnd()
      .split("\n");

  it("passes paths with spaces, quotes and a leading ~ to curl as one argument", () => {
    assert.equal(shellWords(uploadCommand("~/Books/It's Dune $1.epub", "https://r2/x?a=1&b=2", "https://api/f"))[3], "/home/me/Books/It's Dune $1.epub");
    assert.equal(shellWords(uploadCommand("/tmp/a b.epub", "https://r2/x?a=1&b=2", "https://api/f"))[4], "https://r2/x?a=1&b=2");
  });
});
