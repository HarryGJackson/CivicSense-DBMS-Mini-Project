/**
 * Turning complaint text into a 384-number vector.
 *
 * The model (all-MiniLM-L6-v2) runs locally through @xenova/transformers.
 * No API key, no network call per request. It is downloaded once, about
 * 90 MB, and cached under node_modules/.cache after that.
 *
 * If the model cannot be loaded — no internet on the first run, say — embed()
 * returns null instead of throwing, and the duplicate search falls back to
 * PostgreSQL full-text search. The app keeps working; it just stops catching
 * complaints that are worded differently, which is the whole point of the
 * vector half. The UI says which method was used so the difference is visible.
 */

let embedder = null;
let loadFailed = false;
let loadingPromise = null;

async function getEmbedder() {
  if (embedder) return embedder;
  if (loadFailed) return null;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const { pipeline, env } = await import('@xenova/transformers');
      env.allowLocalModels = false;
      console.log('[embeddings] loading all-MiniLM-L6-v2 (first run downloads ~90MB)...');
      embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      console.log('[embeddings] model ready');
      return embedder;
    } catch (err) {
      console.warn('[embeddings] model unavailable, falling back to full-text search:', err.message);
      loadFailed = true;
      return null;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/**
 * @returns {Promise<number[]|null>} 384 numbers, or null if the model is unavailable.
 */
export async function embed(text) {
  const model = await getEmbedder();
  if (!model) return null;
  // mean pooling + L2 normalise, so cosine distance behaves predictably
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/** pgvector wants a vector literal, not a JS array: '[0.1,0.2,...]' */
export function toVectorLiteral(vec) {
  return `[${vec.map((v) => v.toFixed(6)).join(',')}]`;
}

export function isModelAvailable() {
  return embedder !== null && !loadFailed;
}
