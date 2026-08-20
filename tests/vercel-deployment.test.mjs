import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("routes every hosted API request to the Vercel function", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));

  assert.ok(config.functions["api/index.ts"]);
  assert.deepEqual(config.rewrites, [
    { source: "/api/:path*", destination: "/api?path=:path*" },
  ]);
});

test("uses the same-origin API in the production browser bundle", async () => {
  const assetsDirectory = new URL("../dist-vercel/assets/", import.meta.url);
  const javascriptFiles = (await readdir(assetsDirectory)).filter((file) => file.endsWith(".js"));
  const bundle = (await Promise.all(
    javascriptFiles.map((file) => readFile(new URL(file, assetsDirectory), "utf8")),
  )).join("\n");

  assert.match(bundle, /["'`]\/api["'`]\?\.trim\(\)/);
});
