const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { mkdtemp, mkdir, writeFile, readFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { CommunityClient, DEFAULT_COMMUNITY_CONFIG, validateConfig, requestJson } = require('../dist/community-client');
const { CommunityAuth } = require('../dist/community-auth');
const { CommunityService, optionSubmission } = require('../dist/community-service');
const { BuiltPresetStore } = require('../dist/preset-generation');

const id = '0123456789abcdef0123456789abcdef';
const data = { comment: 'Library shortcut', description: '', category: 'gameplay', type: 'string', value: '{"libraryShortcut":true}', address: null, gameInit: false, statEdit: false, rawJson: true, additionalWrites: [] };
const item = (kind = 'options', values = {}) => ({ id, kind, createdBy: 'alice', createdAt: '2026-09-09T20:00:00Z', upvotes: 0, downvotes: 0, score: 0, data: kind === 'options' ? data : { metadata: { id: 'example', name: 'Example' }, music: false }, ...values });
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
function storage() {
  const values = new Map();
  return { values, read: key => values.get(key), write: (key, value) => value === null ? values.delete(key) : values.set(key, value), encrypt: text => Buffer.from(text).toString('base64'), decrypt: text => Buffer.from(text, 'base64').toString() };
}

test('community client exercises all nine OpenAPI operations against a local HTTP server', async t => {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
    const url = new URL(req.url, 'http://localhost');
    let result = { status: 'ok' };
    if (url.pathname.startsWith('/v1/')) {
      const kind = url.pathname.split('/')[2];
      result = req.method === 'GET' && url.pathname === `/v1/${kind}` ? { items: [item(kind)] } : item(kind);
    }
    res.writeHead(req.method === 'POST' ? 201 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const config = validateConfig({ ...DEFAULT_COMMUNITY_CONFIG, apiUrl: `http://127.0.0.1:${server.address().port}`, devUser: 'alice' });
  const client = new CommunityClient(config, () => { throw new Error('Local mode must not request tokens'); });
  await client.health();
  for (const kind of ['options', 'presets']) {
    assert.equal((await client.list(kind)).items.length, 1);
    assert.equal((await client.get(kind, id)).id, id);
    await client.create(kind, JSON.stringify(item(kind).data));
    for (const value of [1, -1, 0]) await client.vote(kind, id, value);
  }
  assert.equal(new Set(requests.map(req => `${req.method} ${req.url.split('?')[0]}`)).size, 9);
  for (const req of requests) {
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers['x-dev-user'], req.method === 'GET' ? undefined : 'alice');
    if (req.method === 'POST') assert.equal(JSON.parse(req.body).data, undefined);
  }
});

test('pagination retains an empty page cursor and encodes it opaquely', async () => {
  const cursor = 'a+/=?& spaces';
  const urls = [];
  const client = new CommunityClient(DEFAULT_COMMUNITY_CONFIG, async () => 'unused', async url => { urls.push(url); return response(urls.length === 1 ? { items: [], nextCursor: cursor } : { items: [item()] }); });
  const first = await client.list('options');
  assert.deepEqual(first.items, []);
  const next = await client.list('options', first.nextCursor);
  assert.equal(new URL(urls[1]).searchParams.get('cursor'), cursor);
  assert.equal(next.nextCursor, undefined);
  assert.equal(next.items[0].id, id);
});

test('public reads omit credentials; production writes use only access tokens', async () => {
  let authCalls = 0;
  const calls = [];
  const client = new CommunityClient(DEFAULT_COMMUNITY_CONFIG, async () => { authCalls++; return 'access-token'; }, async (url, init) => { calls.push(init); return response(item()); });
  await client.get('options', id);
  await client.vote('options', id, 1);
  assert.equal(authCalls, 1);
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[1].headers.Authorization, 'Bearer access-token');
  assert.equal(calls[1].headers['X-Dev-User'], undefined);
  assert.equal(calls[1].redirect, 'error');
});

test('connection validation rejects insecure remote URLs and remote development identities', () => {
  for (const apiUrl of ['http://example.com', 'file:///tmp/test', 'https://user:pass@example.com', 'https://example.com/?key=secret', 'https://example.com/#fragment']) {
    assert.throws(() => validateConfig({ ...DEFAULT_COMMUNITY_CONFIG, apiUrl }));
  }
  assert.throws(() => validateConfig({ ...DEFAULT_COMMUNITY_CONFIG, devUser: 'alice' }), /localhost/);
  assert.throws(() => validateConfig({ ...DEFAULT_COMMUNITY_CONFIG, region: 'us-east-1.evil.com' }));
  assert.equal(validateConfig({ ...DEFAULT_COMMUNITY_CONFIG, apiUrl: 'http://localhost:8080/', devUser: 'alice' }).apiUrl, 'http://localhost:8080');
});

test('POST failure is not retried and reminds users to check for duplicate submissions', async () => {
  let calls = 0;
  const client = new CommunityClient(DEFAULT_COMMUNITY_CONFIG, async () => 'token', async () => { calls++; throw new Error('Connection reset after sending'); });
  await assert.rejects(client.create('options', JSON.stringify(data)), /Refresh the catalog.*duplicate/);
  assert.equal(calls, 1);
});

test('client handles API and gateway errors and rejects oversized submissions before sending', async () => {
  const client = new CommunityClient(DEFAULT_COMMUNITY_CONFIG, async () => 'token', async () => response({ error: { code: 'conflict', message: 'Please retry your vote.' } }, 409));
  await assert.rejects(client.vote('options', id, 1), /Please retry your vote/);
  const gateway = new CommunityClient(DEFAULT_COMMUNITY_CONFIG, async () => 'token', async () => response({ message: 'Unauthorized' }, 401));
  await assert.rejects(gateway.vote('options', id, 1), /Unauthorized/);
  const bounded = new CommunityClient(DEFAULT_COMMUNITY_CONFIG, async () => { throw new Error('Must not request authentication'); });
  await assert.rejects(bounded.create('presets', 'é'.repeat(65537)), /128 KiB/);
  await assert.rejects(client.get('bad', id), /collection/);
  await assert.rejects(client.get('options', '../presets'), /ID/);
  await assert.rejects(client.vote('options', id, 2), /upvote/);
});

test('malformed JSON, unsafe numbers, and huge streamed responses cannot silently corrupt imports', async () => {
  for (const text of ['not-json', '{"n":9007199254740993}']) {
    await assert.rejects(requestJson(async () => new Response(text), 'https://example.com', {}), /invalid JSON|precision/);
  }
  await assert.rejects(requestJson(async () => new Response('x'.repeat(8 * 1024 * 1024 + 1)), 'https://example.com', {}), /too large/);
});

test('sign-in persists only encrypted refresh credentials and restores an access token after restart', async () => {
  const store = storage();
  const calls = [];
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    return response({ AuthenticationResult: { AccessToken: body.AuthFlow === 'REFRESH_TOKEN_AUTH' ? 'refreshed-access' : 'initial-access', RefreshToken: body.AuthFlow === 'REFRESH_TOKEN_AUTH' ? undefined : 'refresh-secret', IdToken: 'not-an-access-token', ExpiresIn: 3600 } });
  };
  const auth = new CommunityAuth(store, fetcher);
  await auth.account({ action: 'signIn', email: 'alice@example.com', password: 'password-secret' });
  assert.equal(await auth.accessToken(), 'initial-access');
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(auth.status()).includes('secret'), false);
  assert.equal(store.read('session').includes('refresh-secret'), false);
  const saved = JSON.parse(store.decrypt(store.read('session')));
  assert.equal(saved.refreshToken, 'refresh-secret');
  assert.equal(JSON.stringify(saved).includes('password-secret'), false);
  assert.equal(JSON.stringify(saved).includes('initial-access'), false);
  const restarted = new CommunityAuth(store, fetcher);
  assert.equal(restarted.status().signedIn, true);
  assert.equal(await restarted.accessToken(), 'refreshed-access');
  assert.deepEqual(calls[1].AuthParameters, { REFRESH_TOKEN: 'refresh-secret' });
  await restarted.account({ action: 'signOut' });
  assert.equal(store.read('session'), undefined);
  assert.equal(new CommunityAuth(store, fetcher).status().signedIn, false);
});

test('unavailable secure storage keeps tokens in memory and a rejected refresh clears the saved session', async () => {
  const store = storage();
  store.encrypt = () => null;
  const auth = new CommunityAuth(store, async () => response({ AuthenticationResult: { AccessToken: 'access', RefreshToken: 'refresh', ExpiresIn: 3600 } }));
  await auth.account({ action: 'signIn', email: 'a@b.com', password: 'test' });
  assert.equal(auth.status().remembered, false);
  assert.equal(store.read('session'), undefined);
  const remembered = storage();
  const old = new CommunityAuth(remembered, async () => response({ AuthenticationResult: { AccessToken: 'access', RefreshToken: 'refresh', ExpiresIn: 1 } }));
  await old.account({ action: 'signIn', email: 'a@b.com', password: 'test' });
  const expired = new CommunityAuth(remembered, async () => response({ message: 'Refresh Token has expired' }, 400));
  await assert.rejects(expired.accessToken(), /expired.*Sign in/);
  assert.equal(expired.status().signedIn, false);
  assert.equal(remembered.read('session'), undefined);
});

test('changing deployments discards the previous account and credentials', async () => {
  const store = storage();
  const auth = new CommunityAuth(store, async () => response({ AuthenticationResult: { AccessToken: 'access', RefreshToken: 'refresh', ExpiresIn: 3600 } }));
  await auth.account({ action: 'signIn', email: 'a@b.com', password: 'test' });
  auth.configure({ ...DEFAULT_COMMUNITY_CONFIG, apiUrl: 'https://another.example.com' });
  assert.equal(auth.status().signedIn, false);
  assert.equal(store.read('session'), undefined);
  assert.equal(new CommunityAuth(store).config.apiUrl, 'https://another.example.com');
});

test('a transient refresh failure preserves the saved session for a later attempt', async () => {
  const store = storage();
  const old = new CommunityAuth(store, async () => response({ AuthenticationResult: { AccessToken: 'access', RefreshToken: 'refresh', ExpiresIn: 1 } }));
  await old.account({ action: 'signIn', email: 'a@b.com', password: 'test' });
  const restarted = new CommunityAuth(store, async () => { throw new Error('Offline'); });
  await assert.rejects(restarted.accessToken(), /connection/);
  assert.equal(restarted.status().signedIn, true);
  assert.ok(store.read('session'));
});

test('a rejected API session signs out without retrying the submission', async t => {
  const database = new DatabaseSync(':memory:'); t.after(() => database.close());
  let posts = 0;
  const service = new CommunityService({ database, storage: storage(), builds: new BuiltPresetStore(), createOption() { throw new Error('Unused'); }, loadOption: () => ({ id: 1, ...data }),
    fetcher: async url => {
      if (url.includes('cognito-idp')) return response({ AuthenticationResult: { AccessToken: 'access', RefreshToken: 'refresh', ExpiresIn: 3600 } });
      posts++; return response({ message: 'Unauthorized' }, 401);
    } });
  await service.request({ action: 'account', account: { action: 'signIn', email: 'a@b.com', password: 'test' } });
  const result = await service.request({ action: 'shareOption', localId: 1 });
  assert.equal(result.status, 'error'); assert.match(result.error, /Sign in again/);
  assert.equal(posts, 1);
  assert.equal((await service.request({ action: 'status' })).data.signedIn, false);
});

test('failed imports roll back local rows and mappings together', async t => {
  const database = new DatabaseSync(':memory:'); t.after(() => database.close());
  database.exec('CREATE TABLE local_options (id INTEGER PRIMARY KEY, data TEXT)');
  const service = new CommunityService({ database, storage: storage(), builds: new BuiltPresetStore(), fetcher: async () => response(item()),
    loadOption() { throw new Error('No existing option'); }, createOption(input) { database.prepare('INSERT INTO local_options (data) VALUES (?)').run(JSON.stringify(input)); throw new Error('Import failed'); } });
  assert.equal((await service.request({ action: 'importOption', kind: 'options', id })).status, 'error');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM local_options').get().count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM community_option_imports').get().count, 0);
});

test('account registration, confirmation, and recovery use the Cognito operations and never expose tokens', async () => {
  const calls = [];
  const auth = new CommunityAuth(storage(), async (_url, init) => { calls.push({ action: init.headers['X-Amz-Target'].split('.').pop(), body: JSON.parse(init.body) }); return response({}); });
  for (const action of ['signUp', 'confirm', 'resend', 'forgot', 'reset']) {
    const result = await auth.account({ action, email: 'alice@example.com', password: 'ExamplePassword!1', code: '123456' });
    assert.equal(result.account.signedIn, false);
  }
  assert.deepEqual(calls.map(call => call.action), ['SignUp', 'ConfirmSignUp', 'ResendConfirmationCode', 'ForgotPassword', 'ConfirmForgotPassword']);
  assert.equal(calls[0].body.UserAttributes[0].Value, 'alice@example.com');
  assert.equal(calls[1].body.ConfirmationCode, '123456');
  assert.equal(calls[4].body.Password, 'ExamplePassword!1');
});

test('option imports persist catalog-to-local mappings, avoid duplicates, and preserve local edits', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('CREATE TABLE local_options (id INTEGER PRIMARY KEY, data TEXT)');
    const store = storage();
    let creates = 0;
    const deps = { database, storage: store, builds: new BuiltPresetStore(), fetcher: async () => response(item()),
      createOption(input) { creates++; const id = Number(database.prepare('INSERT INTO local_options (data) VALUES (?)').run(JSON.stringify(input)).lastInsertRowid); return { id, ...input }; },
      loadOption(id) { const row = database.prepare('SELECT data FROM local_options WHERE id = ?').get(id); if (!row) throw new Error('Missing'); return { id, ...JSON.parse(row.data) }; } };
    const service = new CommunityService(deps);
    const request = { action: 'importOption', kind: 'options', id };
    const [first, duplicate] = await Promise.all([service.request(request), service.request(request)]);
    assert.equal(first.status, 'ok'); assert.equal(first.data.option.id, 1);
    assert.equal(duplicate.data.alreadyImported, true); assert.equal(creates, 1);
    database.prepare('UPDATE local_options SET data = ? WHERE id = 1').run(JSON.stringify({ ...data, comment: 'Local edit' }));
    const restarted = new CommunityService(deps);
    assert.equal((await restarted.request(request)).data.option.comment, 'Local edit');
    assert.equal(creates, 1);
    const bad = await service.request({ action: 'unknown' });
    assert.equal(bad.status, 'error');
    assert.equal((await service.request({ action: 'status' })).status, 'ok');
  } finally { database.close(); }
});

test('sharing strips local option fields and sends verified preset files; stale builds are rejected', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'community-share-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'presets')); await mkdir(path.join(root, 'build', 'presets'), { recursive: true });
  const json = JSON.stringify(item('presets').data);
  await writeFile(path.join(root, 'presets/example.json'), json);
  await writeFile(path.join(root, 'build/presets/example.js'), 'module.exports = {}');
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  const builds = new BuiltPresetStore(database);
  const token = await builds.remember(root, 'example', { localPresetId: 'local-draft', json });
  const local = { id: 42, readOnly: true, ...data };
  assert.deepEqual(optionSubmission(local), data);
  const store = storage(); store.write('config', JSON.stringify({ ...DEFAULT_COMMUNITY_CONFIG, apiUrl: 'http://localhost:8080', devUser: 'alice' }));
  const submitted = [];
  const service = new CommunityService({ database, storage: store, builds, createOption() { throw new Error('Unexpected import'); }, loadOption: () => local,
    fetcher: async (url, init) => { submitted.push(init.body); return response(item(url.endsWith('/presets') ? 'presets' : 'options'), 201); } });
  assert.equal((await service.request({ action: 'shareOption', localId: 42 })).status, 'ok');
  assert.deepEqual(JSON.parse(submitted[0]), data);
  assert.equal((await service.request({ action: 'sharePreset', buildToken: token })).status, 'ok');
  assert.equal(submitted[1], json);
  await writeFile(path.join(root, 'presets/example.json'), '{}');
  const stale = await service.request({ action: 'sharePreset', buildToken: token });
  assert.equal(stale.status, 'error'); assert.match(stale.error, /Export and build/);
  assert.equal(submitted.length, 2);
});


test('username registration omits email and username sign-in obtains a private session', async () => {
  const calls = [];
  const auth = new CommunityAuth(storage(), async (_url, init) => {
    const action = init.headers['X-Amz-Target'].split('.').pop();
    calls.push({ action, body: JSON.parse(init.body) });
    return response(action === 'SignUp' ? { UserConfirmed: true } : { AuthenticationResult: { AccessToken: 'access', RefreshToken: 'refresh', ExpiresIn: 3600 } });
  });
  const registration = await auth.account({ action: 'signUp', username: '  castle_runner  ', password: 'ExamplePassword!1' });
  assert.match(registration.message, /You can sign in now/);
  assert.equal(calls[0].body.Username, 'castle_runner');
  assert.equal(calls[0].body.UserAttributes, undefined);
  await auth.account({ action: 'signIn', username: 'castle_runner', password: 'ExamplePassword!1' });
  assert.deepEqual(calls[1].body.AuthParameters, { USERNAME: 'castle_runner', PASSWORD: 'ExamplePassword!1' });
  assert.equal(auth.status().signedIn, true);
  assert.equal(auth.status().email, 'castle_runner');
  assert.equal(JSON.stringify(auth.status()).includes('ExamplePassword'), false);
  await assert.rejects(auth.account({ action: 'signIn', username: '  ', password: 'test' }), /username/);
  await assert.rejects(auth.account({ action: 'signUp', username: 'a'.repeat(129), password: 'test' }), /username/);
});
