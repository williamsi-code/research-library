// Claude (answers, summaries) and OpenAI embeddings (semantic search).
// Both are optional: without them the app still works with keyword search.

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const embeddingsEnabled = () => Boolean(process.env.OPENAI_API_KEY);
export const claudeModel = () => process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';

// The database column is vector(1536), which matches text-embedding-3-small.
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

// prompt can be a string or an array of content blocks (text, image, document).
export async function askClaude({ system, prompt, maxTokens = 2000, timeoutMs = 120_000 }) {
  if (!aiEnabled()) throw httpError(400, 'AI is off. Add ANTHROPIC_API_KEY in Railway variables to use it.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: claudeModel(),
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw httpError(502, `Claude request failed: ${data?.error?.message || res.status}`);
  }
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

export async function embed(texts) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Embedding request failed: ${data?.error?.message || res.status}`);
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export const toVector = (arr) => `[${arr.join(',')}]`;

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Pull a JSON object out of a model reply, tolerating code fences.
export function parseJsonReply(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Audio transcription with timestamps (OpenAI). Files must be 25 MB or smaller.
export async function transcribeAudio(buffer, fileName, mimeType) {
  if (!embeddingsEnabled()) throw httpError(400, 'Transcribing audio needs OPENAI_API_KEY in Railway variables.');
  if (buffer.length > 25 * 1024 * 1024) throw httpError(413, 'Audio files must be 25 MB or smaller to transcribe.');
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType || 'audio/mpeg' }), fileName || 'audio.mp3');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(15 * 60_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Transcription failed: ${data?.error?.message || res.status}`);
  return (data.segments || []).map((s) => ({ start: s.start, text: s.text }));
}
