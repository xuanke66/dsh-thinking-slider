/**
 * Host half of the thinking-slider bundle.
 *
 * Two jobs: serve the 241-frame evolution clip the Client half scrubs (which
 * needs RFC 7233 byte ranges for frame-accurate seeking), and persist the
 * Client's per-model effort memory so it survives a restart. The memory lives
 * in a file rather than browser storage because the Web port is not guaranteed
 * to be stable across launches, and localStorage is keyed by origin.
 */
import { createReadStream, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Public route the Client half fetches. Distinct prefix from /plugins. */
export const VIDEO_ROUTE = '/thinking-slider/liang-evolution.mp4';

/** Durable per-model effort memory. */
export const PREFERENCES_ROUTE = '/thinking-slider/preferences';

const VIDEO_PATH = fileURLToPath(new URL('./video/liang-evolution.mp4', import.meta.url));
const PREFERENCES_PATH = fileURLToPath(new URL('./preferences.json', import.meta.url));
const PREFERENCES_MAX_BYTES = 64 * 1024;
const PREFERENCES_MAX_ENTRIES = 200;

/** Optional service: without a web server this bundle stays inert. */
export const inject = ['webServer'];

function videoSize() {
  // Deliberately re-stated per request: the README tells users to drop a new
  // clip over this path, and a cached size would then send a wrong
  // Content-Length and break range seeking until the process restarted.
  return statSync(VIDEO_PATH).size;
}

/**
 * Parse one RFC 7233 byte range, including the suffix form `bytes=-N`.
 * @param header - the raw Range request header, when present.
 * @param size - current resource size in bytes.
 * @returns the inclusive range, or null for a whole-resource response.
 */
function parseRange(header, size) {
  if (typeof header !== 'string' || !header.startsWith('bytes=')) return null;
  const [rawStart, rawEnd] = header.slice('bytes='.length).split('-', 2);
  if (rawStart === undefined) return null;
  let start;
  let end;
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === undefined || rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  // Integers only. A fractional offset passes a finiteness check and then
  // reaches createReadStream AFTER the 206 head was written, where its
  // ERR_OUT_OF_RANGE destroys the response instead of answering 416.
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

function handle(req, res) {
  let size;
  try {
    size = videoSize();
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`thinking-slider: 素材缺失 ${VIDEO_PATH}\n${String(error)}`);
    return;
  }

  const range = parseRange(req.headers.range, size);
  const shared = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600',
  };

  if (range === null) {
    if (req.headers.range !== undefined) {
      res.writeHead(416, { ...shared, 'Content-Range': `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(200, { ...shared, 'Content-Length': String(size) });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(VIDEO_PATH);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    return;
  }

  const { start, end } = range;
  res.writeHead(206, {
    ...shared,
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Content-Length': String(end - start + 1),
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(VIDEO_PATH, { start, end });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/**
 * Keep only well-formed `provider/model -> effortId` string pairs, capped so a
 * corrupt or hostile body cannot grow the file without bound.
 * @param value - the candidate `efforts` object.
 * @returns a fresh sanitized object.
 */
function sanitizeEfforts(value) {
  const safe = {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return safe;
  for (const [key, effort] of Object.entries(value)) {
    if (typeof key !== 'string' || key === '') continue;
    if (typeof effort !== 'string' || effort === '') continue;
    safe[key] = effort;
    if (Object.keys(safe).length >= PREFERENCES_MAX_ENTRIES) break;
  }
  return safe;
}

/**
 * Read the stored memory. A missing, empty, or unreadable file is not an error:
 * the memory simply starts empty.
 * @returns `{ efforts }`, always a well-formed object.
 */
function readPreferences() {
  try {
    // A hand-edited file (Notepad and friends) usually carries a UTF-8 BOM,
    // which `JSON.parse` rejects outright. Stripping it here keeps such an edit
    // from silently emptying the memory.
    const raw = readFileSync(PREFERENCES_PATH, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    const efforts =
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? sanitizeEfforts(parsed.efforts)
        : {};
    return { efforts };
  } catch (error) {
    return { efforts: {} };
  }
}

function handlePreferences(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const body = JSON.stringify(readPreferences());
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(body)),
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(body);
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'GET, HEAD, POST', 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('method not allowed');
    return;
  }

  const chunks = [];
  let size = 0;
  let overflowed = false;
  req.on('data', (chunk) => {
    if (overflowed) return;
    size += chunk.length;
    if (size > PREFERENCES_MAX_BYTES) {
      // Stop buffering but let the body drain, so the client still gets a
      // readable rejection instead of a bare connection reset.
      overflowed = true;
      chunks.length = 0;
      return;
    }
    chunks.push(chunk);
  });
  req.on('error', () => res.destroy());
  req.on('end', () => {
    if (overflowed) {
      res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('body too large');
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('invalid JSON body');
      return;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('expected an object with an "efforts" object');
      return;
    }
    const efforts = parsed.efforts;
    // A body that does not carry a real `efforts` object is refused rather than
    // treated as an empty memory: silently storing `{}` would erase what the
    // user had chosen.
    if (efforts === null || typeof efforts !== 'object' || Array.isArray(efforts)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('expected an object with an "efforts" object');
      return;
    }
    const body = JSON.stringify({ efforts: sanitizeEfforts(efforts) }, null, 2);
    try {
      // Write-then-rename: a crash mid-write cannot leave a half-written memory.
      const staging = PREFERENCES_PATH + '.tmp';
      writeFileSync(staging, body, 'utf8');
      renameSync(staging, PREFERENCES_PATH);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String((error && error.message) || error));
      return;
    }
    res.writeHead(204);
    res.end();
  });
}

/**
 * @param ctx - host root context.
 */
export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: VIDEO_ROUTE, handler: handle }),
    'thinking-slider: evolution clip route',
  );
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: PREFERENCES_ROUTE,
        handler: handlePreferences,
      }),
    'thinking-slider: preferences route',
  );
}
