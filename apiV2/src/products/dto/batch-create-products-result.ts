export type BatchItemResult = { ok: true; id: string } | { ok: false; reason: string };

export interface BatchCreateProductsResult {
  results: BatchItemResult[];
  succeeded: number;
  failed: number;
}
