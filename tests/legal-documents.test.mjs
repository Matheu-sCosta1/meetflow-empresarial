import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const legal = await readFile(new URL("../app/legal-documents.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/local-app.tsx", import.meta.url), "utf8");
const client = await readFile(new URL("../app/lib/meetflow-api.ts", import.meta.url), "utf8");
const router = await readFile(new URL("../vercel-api/router.ts", import.meta.url), "utf8");
const database = await readFile(new URL("../vercel-api/db.ts", import.meta.url), "utf8");

test("publishes complete terms and privacy documents from the registration flow", () => {
  assert.match(legal, /Termos de Uso/);
  assert.match(legal, /Política de Privacidade/);
  assert.match(legal, /Papéis de proteção de dados/);
  assert.match(legal, /Direitos dos titulares/);
  assert.match(legal, /Incidentes de segurança/);
  assert.match(legal, /Vercel/);
  assert.match(legal, /Neon/);
  assert.match(legal, /Brevo/);
  assert.match(legal, /legalDocumentUrl\("terms"\)/);
  assert.match(legal, /legalDocumentUrl\("privacy"\)/);
  assert.match(legal, /target="_blank"/);
  assert.match(dashboard, /LegalConsent/);
});

test("provides printable and shareable public legal routes", () => {
  assert.match(legal, /document=\$\{kind\}/);
  assert.match(legal, /window\.print\(\)/);
  assert.match(legal, /DOCUMENTO PÚBLICO/);
  assert.match(dashboard, /legalDocumentFromHash/);
  assert.match(dashboard, /hashchange/);
});

test("offers a professional responsive reading and consent experience", () => {
  assert.match(legal, /LegalConsent/);
  assert.match(legal, /legal-consent-documents/);
  assert.match(legal, /name="acceptTerms"/);
  assert.match(legal, /readingProgress/);
  assert.match(legal, /IntersectionObserver/);
  assert.match(legal, /legal-mobile-sheet/);
  assert.match(legal, /aria-current/);
  assert.match(dashboard, /<LegalConsent \/>/);
});

test("records the exact accepted terms and privacy versions", () => {
  assert.match(database, /terms_version VARCHAR\(20\)/);
  assert.match(database, /privacy_version VARCHAR\(20\)/);
  assert.match(router, /acceptedLegalVersions/);
  assert.match(router, /TERMS_VERSION = "2026\.08"/);
  assert.match(router, /PRIVACY_VERSION = "2026\.08"/);
  assert.match(client, /termsVersion: string/);
  assert.match(client, /privacyVersion: string/);
  assert.match(router, /terms_accepted_at, terms_version, privacy_version/);
});

test("uses only official Brazilian privacy references", () => {
  assert.match(legal, /planalto\.gov\.br/);
  assert.match(legal, /gov\.br\/anpd/);
  assert.doesNotMatch(legal, /privacy\.com|termly|iubenda/i);
});
