import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const marker = "/* Mobile application pass — desktop rules above remain unchanged */";
const mobile = styles.slice(styles.indexOf(marker));

test("keeps the approved desktop visual system and scopes the new pass to mobile", () => {
  assert.ok(styles.includes(marker));
  assert.match(mobile, /^\/\* Mobile application pass[^]*@media\(max-width:820px\)/);
  assert.doesNotMatch(mobile.slice(0, mobile.indexOf("@media(max-width:820px)")), /\.[a-z]/);
});

test("presents navigation and the AI launcher as a mobile application dock", () => {
  assert.match(mobile, /\.mobile-nav\{left:10px;right:10px;bottom:max\(8px,env\(safe-area-inset-bottom\)\);height:70px/);
  assert.match(mobile, /border-radius:21px/);
  assert.match(mobile, /\.mobile-nav button\.active\{background:#e9f4e3/);
  assert.match(mobile, /\.ai-fab\{bottom:calc\(17px \+ env\(safe-area-inset-bottom\)\);width:62px;height:62px/);
});

test("adapts dense product areas for large and small phones", () => {
  assert.match(mobile, /@media\(max-width:600px\)/);
  assert.match(mobile, /\.stats-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(mobile, /\.calendar-summary,.team-summary\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(mobile, /\.chat-shell\{height:calc\(100dvh - 164px\)/);
  assert.match(mobile, /@media\(max-width:430px\)/);
  assert.match(mobile, /@media\(max-width:350px\)/);
  assert.match(mobile, /padding-bottom:max\(9px,env\(safe-area-inset-bottom\)\)/);
});
