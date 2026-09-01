import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const legal = await readFile(new URL("../app/legal-documents.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const mobile = styles.slice(styles.indexOf("/* Mobile legal reading pass"));

test("preserves desktop and scopes the legal reading refinement to mobile", () => {
  assert.match(mobile, /^\/\* Mobile legal reading pass[^]*@media\(max-width:760px\)/);
  assert.doesNotMatch(mobile.slice(0, mobile.indexOf("@media(max-width:760px)")), /\.legal-page\{/);
});

test("presents a compact progress-aware legal reader on phones", () => {
  assert.match(legal, /activeSectionIndex/);
  assert.match(legal, /Seção \{activeSectionIndex \+ 1\} de \{sections\.length\}/);
  assert.match(legal, /\{Math\.round\(readingProgress\)\}% lido/);
  assert.match(mobile, /\.legal-page \.legal-topbar\{height:64px;min-height:64px/);
  assert.match(mobile, /\.legal-mobile-index\{top:72px/);
  assert.match(mobile, /env\(safe-area-inset-bottom\)/);
});

test("turns dense legal tables and consent controls into mobile components", () => {
  assert.match(legal, /data-label="Finalidade"/);
  assert.match(legal, /data-label="Dados principais"/);
  assert.match(legal, /data-label="Base jurídica possível"/);
  assert.match(mobile, /\.legal-page \.legal-table thead\{display:none\}/);
  assert.match(mobile, /content:attr\(data-label\)/);
  assert.match(mobile, /\.legal-consent-documents\{grid-template-columns:1fr/);
  assert.match(mobile, /\.legal-checkmark\{width:22px;height:22px/);
});

test("makes document actions unmistakable on the dark mobile header", () => {
  assert.match(legal, /aria-label="Imprimir ou salvar documento em PDF"/);
  assert.match(mobile, /Mobile legal action contrast/);
  assert.match(mobile, /button\.legal-print\{border:1px solid #e5ffae!important;background:linear-gradient/);
  assert.match(mobile, /nav a\.active\{background:#f7fff2/);
  assert.match(mobile, /\.legal-footer-print\{border-color:#bad5ae;background:#eef8e8/);
});
