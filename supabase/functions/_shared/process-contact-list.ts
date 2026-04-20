/**
 * processContactList — normaliza, deduplica e resolve uma lista de contatos
 * (LID / JID / número) usando uma função resolveContact com concorrência limitada.
 */

export type ResolvedType = "lid" | "jid" | "number";

export interface ResolvedContact {
  original: string;
  type: ResolvedType;
  jid: string | null;
  number: string | null;
  valid: boolean;
  error?: string;
}

export type ResolveContactFn = (input: string) => Promise<ResolvedContact>;

export interface ProcessOptions {
  concurrency?: number;
}

export async function processContactList(
  inputs: string[],
  resolveContact: ResolveContactFn,
  options: ProcessOptions = {},
): Promise<ResolvedContact[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 5, 20));

  // 1. Trim, ignora vazios e remove duplicados (preservando ordem)
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const raw of Array.isArray(inputs) ? inputs : []) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queue.push(value);
  }

  if (queue.length === 0) return [];

  // 2. Worker pool — processa em lotes de até `concurrency` requisições simultâneas.
  const results: ResolvedContact[] = new Array(queue.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= queue.length) return;
      const original = queue[idx];
      try {
        const result = await resolveContact(original);
        results[idx] = result ?? {
          original,
          type: "number",
          jid: null,
          number: null,
          valid: false,
          error: "Resposta vazia do resolvedor",
        };
      } catch (err) {
        // 3. try/catch individual — uma falha não derruba o lote
        results[idx] = {
          original,
          type: "number",
          jid: null,
          number: null,
          valid: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results;
}
