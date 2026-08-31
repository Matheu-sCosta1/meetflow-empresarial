import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/local-app.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("makes primary and secondary actions visually explicit", () => {
  assert.match(styles, /\.button-primary\{border-color:#184a35;background:linear-gradient/);
  assert.match(styles, /\.button-soft\{border-color:#b9ccb9;background:linear-gradient/);
  assert.match(styles, /\.button:active:not\(:disabled\)/);
  assert.match(styles, /button:focus-visible,a:focus-visible,input:focus-visible/);
  assert.match(dashboard, /button button-primary empty-action/);
  assert.match(dashboard, /className="button button-primary empty-action"[^\n]*<ArrowRight/);
  assert.match(dashboard, /className="panel-action".*Abrir agenda/);
});

test("applies one structured visual system across the product", () => {
  assert.match(styles, /Senior visual system: explicit actions, structured surfaces and adaptive layouts/);
  assert.match(styles, /\.panel\{border-color:var\(--line-strong\)/);
  assert.match(styles, /\.stat-card\{position:relative;overflow:hidden/);
  assert.match(styles, /\.quick-row\{width:calc\(100% - 24px\)/);
  assert.match(styles, /\.modal>header\{margin:-23px -23px 20px/);
  assert.match(styles, /\.member-card footer button\{min-height:30px/);
  assert.match(styles, /input:hover,select:hover,textarea:hover/);
});

test("covers desktop, tablet, large phone and small phone layouts", () => {
  for (const breakpoint of ["1150", "900", "820", "680", "600", "480", "370"]) {
    assert.match(styles, new RegExp(`@media\\(max-width:${breakpoint}px\\)`));
  }
  assert.match(styles, /@media\(max-width:370px\)\{\.stats-grid,\.status-grid\{grid-template-columns:1fr\}/);
  assert.match(styles, /@media\(max-width:600px\)\{\.welcome-row\{grid-template-columns:1fr/);
  assert.match(styles, /\.page-head>\.button\{width:100%\}/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
});
