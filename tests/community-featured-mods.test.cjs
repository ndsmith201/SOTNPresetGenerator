const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { CommunityClient, CommunityHttpError, DEFAULT_COMMUNITY_CONFIG } = require('../dist/community-client');
const { CommunityService } = require('../dist/community-service');
const { BuiltPresetStore } = require('../dist/preset-generation');

const id = '0123456789abcdef0123456789abcdef';
const route = `/v1/featured-mods/${id}/download`;
const apiUrl = DEFAULT_COMMUNITY_CONFIG.apiUrl;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
// A valid transparent 1 × 1 PNG keeps artwork caching tests small and offline.
const artwork = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const artworkDataUrl = `data:image/png;base64,${artwork.toString('base64')}`;
const imageResponse = () => new Response(artwork, { headers: { 'content-type': 'image/png' } });
const mod = (changes = {}) => ({
  id, title: 'Castle Remix', description: 'A fresh adventure through the castle.',
  image: 'https://featured-mods.s3.us-east-1.amazonaws.com/artwork.png',
  releaseTime: '2026-12-01T00:00:00Z', downloadAvailable: false,
  downloadUrl: route, createdBy: 'publisher', createdAt: '2026-10-07T18:00:00Z',
  ...changes
});
function ppf(version = 3) {
  const bytes = Buffer.alloc({ 1: 56, 2: 1084, 3: 60 }[version]);
  bytes.write(`PPF${version}0`, 0, 'ascii');
  bytes[5] = version - 1;
  return bytes;
}
function client(fetcher, config = DEFAULT_COMMUNITY_CONFIG) {
  return new CommunityClient(config, () => { throw new Error('Featured mods must not request account credentials'); }, fetcher);
}
function storage() {
  const values = new Map();
  return { values, read: key => values.get(key), write: (key, value) => value === null ? values.delete(key) : values.set(key, value),
    encrypt: value => Buffer.from(value).toString('base64'), decrypt: value => Buffer.from(value, 'base64').toString() };
}
function service(t, overrides = {}) {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  return new CommunityService({ database, storage: storage(), builds: new BuiltPresetStore(),
    createOption() { throw new Error('Featured mods must not import options'); },
    loadOption() { throw new Error('Featured mods must not load options'); }, ...overrides });
}
function assertPublic(init) {
  const headers = new Headers(init.headers);
  assert.equal(init.method, 'GET');
  assert.equal(init.credentials, 'omit');
  assert.equal(headers.has('authorization'), false);
  assert.equal(headers.has('x-dev-user'), false);
  assert.equal(init.body, undefined);
}

test('featured metadata is a public request independent of PPF download and release availability', async () => {
  const calls = [];
  const expected = mod();
  const result = await client(async (url, init) => { calls.push({ url, init }); return json(expected); }).featuredMod();
  assert.deepEqual(result, expected);
  assert.equal(result.downloadAvailable, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${apiUrl}/v1/featured-mods`);
  assertPublic(calls[0].init);
  assert.equal(calls[0].init.redirect, 'error');
});

test('missing featured metadata returns null while connection and malformed responses fail clearly', async () => {
  assert.equal(await client(async () => json({ error: { message: 'No featured mod' } }, 404)).featuredMod(), null);
  await assert.rejects(client(async () => { throw new Error('Offline'); }).featuredMod(), /reach.*community|connection/i);
  await assert.rejects(client(async () => new Response('not-json')).featuredMod(), /invalid|reach.*community/i);
  await assert.rejects(client(async () => json(null)).featuredMod(), /invalid featured mod/i);
});

test('featured metadata rejects malformed text, IDs, timestamps, availability, and download routes', async () => {
  for (const changes of [
    { title: ' ' }, { title: 'é'.repeat(101) }, { description: '\n' }, { description: 'é'.repeat(5001) },
    { id: '../presets' }, { releaseTime: 'later' }, { createdAt: 'yesterday' }, { downloadAvailable: 'true' },
    { createdBy: '' }, { downloadUrl: 'https://example.com/mod.ppf' },
    { downloadUrl: '/v1/featured-mods/ffffffffffffffffffffffffffffffff/download' }
  ]) {
    await assert.rejects(client(async () => json(mod(changes))).featuredMod(), /invalid|ID/i, JSON.stringify(changes));
  }
  const boundary = mod({ title: 'é'.repeat(100), description: 'é'.repeat(5000) });
  assert.deepEqual(await client(async () => json(boundary)).featuredMod(), boundary);
});

test('featured image URLs require HTTPS or a local API alias on the same port without credentials or fragments', async () => {
  for (const image of ['http://example.com/image.png', '/image.png', 'data:image/png;base64,AA==',
    'https://user:secret@example.com/image.png', 'https://example.com/image.png#secret']) {
    await assert.rejects(client(async () => json(mod({ image }))).featuredMod(), /URL|Invalid/i);
  }
  const local = { ...DEFAULT_COMMUNITY_CONFIG, apiUrl: 'http://127.0.0.1:8080', devUser: 'publisher' };
  for (const image of ['http://127.0.0.1:8080/image.png', 'http://localhost:8080/image.png', 'http://[::1]:8080/image.png']) {
    assert.equal((await client(async (_url, init) => { assertPublic(init); return json(mod({ image })); }, local).featuredMod()).image, image);
  }
  for (const image of ['http://127.0.0.1:8081/image.png', 'http://localhost:8081/image.png', 'http://[::1]:8081/image.png', 'http://example.com:8080/image.png']) {
    await assert.rejects(client(async () => json(mod({ image })), local).featuredMod(), /URL/i);
  }
});

test('featured artwork is fetched publicly once and converted to a reusable data URI', async () => {
  const calls = [];
  const imageUrl = mod().image;
  const signed = 'https://featured-mods.s3.us-east-1.amazonaws.com/artwork.png?X-Amz-Signature=example';
  const result = await client(async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? new Response(null, { status: 307, headers: { location: signed } }) : imageResponse();
  }).featuredArtwork(imageUrl);
  assert.equal(result, artworkDataUrl);
  assert.deepEqual(calls.map(call => call.url), [imageUrl, signed]);
  for (const call of calls) { assertPublic(call.init); assert.equal(call.init.redirect, 'manual'); }
});

test('featured artwork rejects non-images, mismatched MIME, unsafe redirects, and oversized streamed data', async () => {
  const imageUrl = mod().image;
  for (const response of [
    new Response('<html>Error</html>', { headers: { 'content-type': 'image/png' } }),
    new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', { headers: { 'content-type': 'image/svg+xml' } }),
    new Response(artwork, { headers: { 'content-type': 'image/jpeg' } })
  ]) await assert.rejects(client(async () => response).featuredArtwork(imageUrl));
  let redirectedRequests = 0;
  await assert.rejects(client(async () => {
    redirectedRequests++;
    return new Response(null, { status: 302, headers: { location: 'https://example.com/untrusted-artwork.png' } });
  }).featuredArtwork(imageUrl));
  assert.equal(redirectedRequests, 1);
  let canceled = false;
  let chunks = 0;
  const body = new ReadableStream({ pull(controller) {
    controller.enqueue(chunks++ === 0 ? artwork : new Uint8Array(1024 * 1024));
  }, cancel() { canceled = true; } });
  await assert.rejects(client(async () => new Response(body, { headers: { 'content-type': 'image/png', 'content-length': String(artwork.length) } })).featuredArtwork(imageUrl));
  assert.equal(canceled, true);
  assert.ok(chunks < 8);
});

test('PPF download follows a signed S3 redirect without tokens, cookies, or development headers', async () => {
  const signed = 'https://featured-mods.s3.us-east-1.amazonaws.com/mod.ppf?X-Amz-Signature=example';
  const calls = [];
  const expected = ppf();
  const result = await client(async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? new Response(null, { status: 302, headers: { location: signed } }) : new Response(expected);
  }).downloadFeaturedMod(id);
  assert.deepEqual(result, expected);
  assert.deepEqual(calls.map(call => call.url), [`${apiUrl}${route}`, signed]);
  for (const call of calls) { assertPublic(call.init); assert.equal(call.init.redirect, 'manual'); }
});

test('PPF redirects permit relative same-origin URLs and local HTTP but reject unsafe file locations', async () => {
  const local = { ...DEFAULT_COMMUNITY_CONFIG, apiUrl: 'http://localhost:8080', devUser: 'publisher' };
  const calls = [];
  await client(async (url, init) => {
    calls.push(url); assertPublic(init);
    return calls.length === 1 ? new Response(null, { status: 307, headers: { location: '/file.ppf' } }) : new Response(ppf());
  }, local).downloadFeaturedMod(id);
  assert.deepEqual(calls, [`${local.apiUrl}${route}`, `${local.apiUrl}/file.ppf`]);
  for (const location of ['http://127.0.0.1:8080/mod.ppf', 'http://[::1]:8080/mod.ppf']) {
    const redirected = [];
    assert.deepEqual(await client(async (url, init) => {
      redirected.push(url); assertPublic(init);
      return redirected.length === 1 ? new Response(null, { status: 302, headers: { location } }) : new Response(ppf());
    }, local).downloadFeaturedMod(id), ppf());
    assert.deepEqual(redirected, [`${local.apiUrl}${route}`, location]);
  }
  for (const location of ['https://example.com/mod.ppf', 'http://featured-mods.s3.us-east-1.amazonaws.com/mod.ppf',
    'https://featured-mods.s3.us-east-1.amazonaws.com.evil.example/mod.ppf',
    'https://user:secret@featured-mods.s3.us-east-1.amazonaws.com/mod.ppf',
    'https://featured-mods.s3.us-east-1.amazonaws.com/mod.ppf#fragment',
    'file:///tmp/mod.ppf', 'http://127.0.0.1:8081/mod.ppf', 'http://localhost:8081/mod.ppf', 'http://[::1]:8081/mod.ppf',
    'http://example.com:8080/mod.ppf']) {
    let requests = 0;
    await assert.rejects(client(async () => { requests++; return new Response(null, { status: 302, headers: { location } }); }, local).downloadFeaturedMod(id), /invalid file location/i, location);
    assert.equal(requests, 1, location);
  }
});

test('PPF redirect loops and missing locations stop without an unbounded request chain', async () => {
  let requests = 0;
  await assert.rejects(client(async () => { requests++; return new Response(null, { status: 302, headers: { location: '/again' } }); }).downloadFeaturedMod(id), /follow/i);
  assert.equal(requests, 4);
  await assert.rejects(client(async () => new Response(null, { status: 302 })).downloadFeaturedMod(id), /follow/i);
  let invalidIdRequests = 0;
  await assert.rejects(client(async () => { invalidIdRequests++; return new Response(ppf()); }).downloadFeaturedMod('../presets'), /ID/i);
  assert.equal(invalidIdRequests, 0);
});

test('PPF download accepts API-supported versions and rejects HTML, short or mismatched headers, and partial responses', async () => {
  for (const version of [1, 2, 3]) assert.deepEqual(await client(async () => new Response(ppf(version))).downloadFeaturedMod(id), ppf(version));
  const wrongMethod = ppf(); wrongMethod[5] = 0;
  for (const bytes of [Buffer.from('<html>Error</html>'), Buffer.alloc(60), ppf(1).subarray(0, 55),
    ppf(2).subarray(0, 1083), ppf(3).subarray(0, 59), wrongMethod]) {
    await assert.rejects(client(async () => new Response(bytes)).downloadFeaturedMod(id), /valid PPF/i);
  }
  await assert.rejects(client(async () => new Response(ppf(), { status: 206 })).downloadFeaturedMod(id), /incomplete/i);
  await assert.rejects(client(async () => new Response(null, { status: 200 })).downloadFeaturedMod(id), /valid PPF/i);
});

test('PPF streamed bodies are bounded even when Content-Length is missing or understated', async () => {
  for (const headers of [{}, { 'content-length': '60' }]) {
    let canceled = false;
    let chunks = 0;
    const body = new ReadableStream({ pull(controller) {
      controller.enqueue(chunks++ === 0 ? ppf() : new Uint8Array(1024 * 1024));
    }, cancel() { canceled = true; } });
    await assert.rejects(client(async () => new Response(body, { headers })).downloadFeaturedMod(id), /too large/i);
    assert.equal(canceled, true);
    assert.ok(chunks < 10);
  }
  let canceled = false;
  const body = new ReadableStream({ cancel() { canceled = true; } });
  await assert.rejects(client(async () => new Response(body, { headers: { 'content-length': String(4 * 1024 * 1024 + 1) } })).downloadFeaturedMod(id), /too large/i);
  assert.equal(canceled, true);
});

test('PPF release and removal failures preserve API status and useful user messages', async () => {
  for (const [status, message] of [[403, 'The scheduled release is tomorrow.'], [404, 'The mod was removed.']]) {
    await assert.rejects(client(async () => json({ error: { message } }, status)).downloadFeaturedMod(id), error => {
      assert.ok(error instanceof CommunityHttpError); assert.equal(error.status, status); assert.equal(error.message, message); return true;
    });
  }
  await assert.rejects(client(async () => new Response('', { status: 403 })).downloadFeaturedMod(id), /not available.*release/i);
  await assert.rejects(client(async () => new Response('', { status: 404 })).downloadFeaturedMod(id), /no longer available/i);
});

test('featured service fetches and saves the separate PPF without requiring a signed-in account', async t => {
  const calls = [];
  const saves = [];
  const featured = mod({ downloadAvailable: true });
  const app = service(t, {
    fetcher: async (url, init) => {
      calls.push(url); assertPublic(init);
      return url.endsWith('/download') ? new Response(ppf()) : url === featured.image ? imageResponse() : json(featured);
    },
    saveFeaturedMod: async (name, download) => { saves.push({ name, bytes: await download() }); return { canceled: false, filePath: '/chosen/Castle Remix.ppf' }; }
  });
  assert.deepEqual(await app.request({ action: 'featuredMod' }), { status: 'ok', data: { ...featured, image: artworkDataUrl } });
  assert.equal(saves.length, 0);
  assert.deepEqual(calls, [`${apiUrl}/v1/featured-mods`, featured.image]);
  assert.deepEqual(await app.request({ action: 'downloadFeaturedMod', id, title: featured.title }), { status: 'ok', data: { canceled: false, filePath: '/chosen/Castle Remix.ppf' } });
  assert.equal(saves[0].name, 'Castle Remix.ppf');
  assert.deepEqual(saves[0].bytes, ppf());
  assert.deepEqual(calls, [`${apiUrl}/v1/featured-mods`, featured.image, `${apiUrl}${route}`]);
  assert.equal((await app.request({ action: 'status' })).data.signedIn, false);
});

test('featured service shares one metadata and artwork load across concurrent calls, account status, and PPF retries', async t => {
  const calls = [];
  const featured = mod();
  let releaseMetadata;
  const metadata = new Promise(resolve => { releaseMetadata = resolve; });
  const app = service(t, {
    fetcher: async (url, init) => {
      calls.push(url); assertPublic(init);
      if (url === featured.image) return imageResponse();
      if (url.endsWith('/download')) return json({ error: { message: 'Release has not arrived yet.' } }, 403);
      return metadata;
    },
    saveFeaturedMod: async (_name, download) => { await download(); return { canceled: false }; }
  });
  const first = app.request({ action: 'featuredMod' });
  const concurrent = app.request({ action: 'featuredMod' });
  releaseMetadata(json(featured));
  const expected = { status: 'ok', data: { ...featured, image: artworkDataUrl } };
  assert.deepEqual(await first, expected);
  assert.deepEqual(await concurrent, expected);
  await app.request({ action: 'status' });
  for (let i = 0; i < 2; i++) {
    const failedDownload = await app.request({ action: 'downloadFeaturedMod', id, title: featured.title });
    assert.equal(failedDownload.status, 'error');
    assert.match(failedDownload.error, /Release has not arrived/);
    assert.deepEqual(await app.request({ action: 'featuredMod' }), expected);
  }
  assert.deepEqual(calls, [`${apiUrl}/v1/featured-mods`, featured.image, `${apiUrl}${route}`, `${apiUrl}${route}`]);
  assert.equal(expected.data.downloadAvailable, false);
});

test('featured cache is per normalized API, reuses prior APIs, and honors the renderer API snapshot', async t => {
  const secondApi = 'https://second-api.example.invalid';
  const calls = [];
  const app = service(t, { fetcher: async (url, init) => {
    calls.push(url); assertPublic(init);
    if (url === mod().image) return imageResponse();
    return json(mod({ title: url.startsWith(secondApi) ? 'Second API mod' : 'First API mod' }));
  } });
  const first = await app.request({ action: 'featuredMod' });
  assert.equal(first.data.title, 'First API mod');
  const configure = async config => {
    assert.equal((await app.request({ action: 'configure', config: { ...DEFAULT_COMMUNITY_CONFIG, ...config } })).status, 'ok');
  };
  await configure({ apiUrl: secondApi });
  // A request captured before configuration changed must still address the original API.
  assert.deepEqual(await app.request({ action: 'featuredMod', apiUrl: `${apiUrl}/` }), first);
  const second = await app.request({ action: 'featuredMod', apiUrl: secondApi });
  assert.equal(second.data.title, 'Second API mod');
  await configure({ apiUrl: `${apiUrl}/`, clientId: 'differentclient' });
  assert.deepEqual(await app.request({ action: 'featuredMod' }), first);
  await configure({ apiUrl: secondApi });
  assert.deepEqual(await app.request({ action: 'featuredMod' }), second);
  assert.deepEqual(calls, [`${apiUrl}/v1/featured-mods`, mod().image, `${secondApi}/v1/featured-mods`, mod().image]);
  assert.equal((await app.request({ action: 'featuredMod', apiUrl: 'file:///tmp/mod' })).status, 'error');
  assert.equal(calls.length, 4);
});

test('missing and failed featured metadata stay cached for the app session and retry in a new service session', async t => {
  for (const outcome of ['missing', 'error']) {
    let calls = 0;
    let hasRecovered = false;
    const fetcher = async () => {
      calls++;
      if (hasRecovered) return json(null, 404);
      if (outcome === 'missing') return json({ error: { message: 'No featured mod' } }, 404);
      throw new Error('Offline');
    };
    const app = service(t, { fetcher });
    const result = await app.request({ action: 'featuredMod' });
    assert.equal(result.status, outcome === 'missing' ? 'ok' : 'error');
    if (outcome === 'missing') assert.equal(result.data, null);
    hasRecovered = true;
    assert.deepEqual(await app.request({ action: 'featuredMod' }), result);
    await app.request({ action: 'configure', config: { ...DEFAULT_COMMUNITY_CONFIG, apiUrl: 'https://other-api.example.invalid' } });
    assert.deepEqual(await app.request({ action: 'featuredMod' }), { status: 'ok', data: null });
    await app.request({ action: 'configure', config: DEFAULT_COMMUNITY_CONFIG });
    assert.deepEqual(await app.request({ action: 'featuredMod' }), result);
    assert.equal(calls, 2);
    const restarted = service(t, { fetcher });
    assert.deepEqual(await restarted.request({ action: 'featuredMod' }), { status: 'ok', data: null });
    assert.equal(calls, 3);
  }
});

test('unavailable featured artwork preserves metadata and avoids later image or metadata retries', async t => {
  const calls = [];
  const featured = mod();
  const app = service(t, { fetcher: async (url, init) => {
    calls.push(url); assertPublic(init);
    return url === featured.image ? new Response('<html>Expired image</html>', { status: 403 }) : json(featured);
  } });
  const expected = { status: 'ok', data: { ...featured, image: '' } };
  assert.deepEqual(await app.request({ action: 'featuredMod' }), expected);
  assert.deepEqual(await app.request({ action: 'featuredMod' }), expected);
  assert.deepEqual(calls, [`${apiUrl}/v1/featured-mods`, featured.image]);
});

test('canceling the PPF save dialog skips the file request and produces a canceled result', async t => {
  let saves = 0;
  const app = service(t, { fetcher: async () => { throw new Error('Canceled saves must not download'); },
    saveFeaturedMod: async () => { saves++; return { canceled: true }; } });
  assert.deepEqual(await app.request({ action: 'downloadFeaturedMod', id, title: 'Castle Remix' }), { status: 'ok', data: { canceled: true } });
  assert.equal(saves, 1);
});

test('featured downloads sanitize save names and reject invalid inputs before opening a save dialog', async t => {
  const names = [];
  const app = service(t, { saveFeaturedMod: async name => { names.push(name); return { canceled: true }; } });
  for (const title of ['../Castle<>:"/\\|?*\u0000Remix', 'CON', 'nul.ppf', 'COM1', 'LPT9']) {
    assert.equal((await app.request({ action: 'downloadFeaturedMod', id, title })).status, 'ok');
    const name = names.at(-1);
    assert.equal(path.basename(name), name);
    assert.equal(/[<>:"/\\|?*\u0000-\u001f]/.test(name), false);
    assert.equal(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name), false);
    assert.ok(name.endsWith('.ppf'));
  }
  const count = names.length;
  for (const request of [{ id: '../mod', title: 'Castle Remix' }, { id, title: ' ' }, { id, title: 'é'.repeat(101) }, { id, title: null }]) {
    assert.equal((await app.request({ action: 'downloadFeaturedMod', ...request })).status, 'error');
  }
  assert.equal(names.length, count);
});

test('a scheduled PPF refused by the API is never passed to the save writer', async t => {
  let dialogs = 0;
  let writes = 0;
  const app = service(t, { fetcher: async () => json({ error: { message: 'Release has not arrived yet.' } }, 403),
    saveFeaturedMod: async (_name, download) => { dialogs++; await download(); writes++; return { canceled: false }; } });
  const result = await app.request({ action: 'downloadFeaturedMod', id, title: 'Castle Remix' });
  assert.equal(result.status, 'error'); assert.match(result.error, /Release has not arrived/);
  assert.equal(dialogs, 1); assert.equal(writes, 0);
});

test('public featured request 401 errors do not discard an existing community session', async t => {
  const store = storage();
  const app = service(t, { storage: store, fetcher: async url => {
    if (url.includes('cognito-idp')) return json({ AuthenticationResult: { AccessToken: 'access-token', RefreshToken: 'refresh-token', ExpiresIn: 3600 } });
    return json({ error: { message: 'Endpoint unavailable' } }, 401);
  }, saveFeaturedMod: async (_name, download) => { await download(); return { canceled: false }; } });
  assert.equal((await app.request({ action: 'account', account: { action: 'signIn', email: 'runner@example.com', password: 'example' } })).status, 'ok');
  const session = store.read('session');
  for (const request of [{ action: 'featuredMod' }, { action: 'downloadFeaturedMod', id, title: 'Castle Remix' }]) {
    assert.equal((await app.request(request)).status, 'error');
    assert.equal((await app.request({ action: 'status' })).data.signedIn, true);
    assert.equal(store.read('session'), session);
  }
});
