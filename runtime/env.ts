export type RuntimeBindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
};

let bindings: RuntimeBindings | undefined;

export function setRuntimeBindings(next: RuntimeBindings) {
  bindings = next;
}

export function getRuntimeBindings() {
  if (!bindings) throw new Error("Os serviços de persistência ainda não estão disponíveis.");
  return bindings;
}
