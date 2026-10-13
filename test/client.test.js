// -----------------------------------------------------------------------------
// The JointSpace client against the fake TV: transport detection, Digest
// authentication, pairing, the errors a user sees, and the cryptography with
// the vectors of ha-philipsjs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_KINDS, PhilipsClient, decodeBody, urlHost } from '../src/philips/client.js';
import { decodeSystem, decryptField, pairingSignature } from '../src/philips/crypto.js';
import { authorization, parseChallenge, verifyAuthorization } from '../src/philips/digest.js';
import { FakePhilips, PIN, createNetwork } from './helpers/fakePhilips.js';

const HOST = '192.0.2.10';
const clientOf = (tv, options = {}) =>
  new PhilipsClient({ host: HOST, request: createNetwork({ [HOST]: tv }).request, ...options });

test('the pairing signature and the decryption match ha-philipsjs', () => {
  assert.equal(pairingSignature(1128, '0667'), 'rdPzC+bdWQHQMcwe3X+LddeG/tA=');
  const android = decodeSystem({
    serialnumber_encrypted: 'bf1BcncGiQyBVS47ZXFWjNXoynlKUNlqDhxQz5ikPEU=\n',
    model_encrypted: '3Cdh9HfKdQZb0UJPzeXau15tgTFcLdYcPGb0NqOreDg=\n',
    name: '65OLED855/12',
  });
  assert.deepEqual(android, {
    serialnumber: 'ABCDEFGHIJKLF',
    model: '65OLED855/12',
    name: '65OLED855/12',
  });
  assert.equal(decryptField('not base64 at all'), null);
  assert.equal(decryptField(''), null);
  assert.equal(decryptField(Buffer.alloc(32).toString('base64')), null, 'bad padding');
});

test('Digest: challenge parsing, response, verification', () => {
  assert.equal(parseChallenge('Basic realm="x"'), null);
  assert.equal(parseChallenge(undefined), null);
  assert.equal(parseChallenge('Digest realm="x", qop="auth-int", nonce="n"'), null);
  const challenge = parseChallenge([
    'Basic realm="x"',
    'Digest realm="XTV", qop="auth", nonce="abc", opaque="o", algorithm=MD5',
  ]);
  assert.deepEqual(
    { ...challenge },
    { realm: 'XTV', nonce: 'abc', opaque: 'o', algorithm: 'MD5', qop: 'auth', count: 0 },
  );
  const credentials = { user: 'device', password: 'key' };
  const header = authorization(challenge, credentials, 'GET', '/6/powerstate');
  assert.match(
    header,
    /^Digest username="device", realm="XTV", nonce="abc", uri="\/6\/powerstate"/,
  );
  assert.match(header, /nc=00000001/);
  assert.ok(!header.includes('key"'), 'the password itself is never sent');
  const check = { ...credentials, realm: 'XTV', nonce: 'abc' };
  assert.equal(verifyAuthorization(header, check, 'GET'), true);
  assert.equal(verifyAuthorization(header, { ...check, password: 'other' }, 'GET'), false);
  assert.equal(verifyAuthorization(header, check, 'POST'), false);
  assert.match(authorization(challenge, credentials, 'GET', '/'), /nc=00000002/);
  // RFC 2069 (no qop) and the -sess variant.
  const old = parseChallenge('Digest realm="r", nonce="n"');
  const plain = authorization(old, credentials, 'GET', '/');
  assert.ok(!plain.includes('qop='));
  assert.equal(verifyAuthorization(plain, { ...credentials, realm: 'r', nonce: 'n' }, 'GET'), true);
  const sess = parseChallenge('Digest realm="r", nonce="n", qop="auth", algorithm=SHA-256-sess');
  const header256 = authorization(sess, credentials, 'GET', '/');
  assert.equal(
    verifyAuthorization(header256, { ...credentials, realm: 'r', nonce: 'n' }, 'GET'),
    true,
  );
});

test('Android: /system over HTTPS on 1926, then authenticated requests', async () => {
  const tv = new FakePhilips();
  const credentials = tv.pairClient();
  const client = clientOf(tv);
  const { info } = await client.readSystem();
  assert.equal(client.secure, true);
  assert.equal(info.platformId, 'sn-abcdefghijklf');
  assert.equal(info.pairing, true);
  assert.equal(info.android, true);
  assert.deepEqual(info.capabilities, { apps: true, launch: true, ambilight: true, hue: true });

  await assert.rejects(client.getPowerState(), { kind: ERROR_KINDS.NOT_PAIRED });
  client.setCredentials(credentials);
  assert.deepEqual(await client.getPowerState(), { powerstate: 'On' });
  const before = tv.requests.length;
  await client.getVolume();
  assert.equal(tv.requests.length - before, 1, 'the challenge is reused');
  tv.rotateNonce();
  await client.getVolume();
  client.setCredentials({ ...credentials, password: 'wrong' });
  await assert.rejects(client.getVolume(), { kind: ERROR_KINDS.AUTH });
});

test('Saphi: /system over HTTP on 1925, no authentication', async () => {
  const tv = new FakePhilips({ kind: 'saphi' });
  const client = clientOf(tv);
  const { info } = await client.readSystem();
  assert.equal(client.secure, false);
  assert.equal(info.pairing, false);
  assert.equal(info.android, false);
  assert.equal(info.model, '50PUS6804/12');
  assert.deepEqual(await client.getAmbilightPower(), { power: 'On' });
  await assert.rejects(client.getApplications(), { kind: ERROR_KINDS.UNSUPPORTED });
});

test('errors: asleep, timeout, nothing Philips, an HTTP failure', async () => {
  const tv = new FakePhilips({ kind: 'saphi' });
  const client = clientOf(tv);
  tv.online = false;
  await assert.rejects(client.readSystem(), { kind: ERROR_KINDS.UNREACHABLE });
  tv.online = 'timeout';
  await assert.rejects(client.getPowerState(), { kind: ERROR_KINDS.UNREACHABLE });
  tv.online = true;
  tv.failures.powerstate = 500;
  await assert.rejects(client.getPowerState(), { kind: ERROR_KINDS.API, status: 500 });
  const broken = new PhilipsClient({
    host: HOST,
    request: async () => {
      throw new Error('something else');
    },
  });
  await assert.rejects(broken.getPowerState(), { kind: ERROR_KINDS.API });
  const other = new PhilipsClient({
    host: HOST,
    request: async () => ({ status: 200, headers: {}, body: '<html>router</html>' }),
  });
  await assert.rejects(other.readSystem(), { kind: ERROR_KINDS.NOT_PHILIPS });
  const odd = new PhilipsClient({
    host: HOST,
    request: async () => ({ status: 200, headers: {}, body: 'garbage {' }),
  });
  await assert.rejects(odd.getPowerState(), { kind: ERROR_KINDS.API });
});

test('the broken JSON of the TVs is repaired, the empty answers are {}', () => {
  assert.deepEqual(decodeBody(''), {});
  assert.deepEqual(decodeBody('Context Service not started'), {});
  assert.deepEqual(decodeBody('{"a": 1,}'), { a: 1 });
  assert.deepEqual(decodeBody('{,"a": [1,,2]}'), { a: [1, 2] });
  assert.equal(decodeBody('<html>'), undefined);
  assert.equal(urlHost('fe80::1'), '[fe80::1]');
  assert.equal(urlHost('tv.local'), 'tv.local');
});

test('pairing: request, wrong PIN, grant with the HMAC signature', async () => {
  const tv = new FakePhilips();
  const client = clientOf(tv);
  const { raw } = await client.readSystem();
  const pending = await client.pairRequest(raw.featuring);
  assert.equal(pending.timestamp, 1128);
  assert.equal(pending.timeoutSeconds, 30);
  assert.match(pending.device.id, /^[0-9a-f]{32}$/);
  assert.equal(pending.device.app_name, 'Gladys Assistant');
  await assert.rejects(client.pairGrant(pending, '1111'), {
    kind: ERROR_KINDS.PAIRING,
    errorId: 'INVALID_PIN',
  });
  const credentials = await client.pairGrant(pending, PIN);
  assert.deepEqual(credentials, { user: pending.device.id, password: pending.authKey });
  assert.deepEqual(await client.getPowerState(), { powerstate: 'On' }, 'the client is paired');
  await assert.rejects(client.pairGrant(pending, PIN), { errorId: 'TIMEOUT' }, 'used once');
});

test('pairing a TV that refuses, or has no pairing', async () => {
  const tv = new FakePhilips();
  const client = clientOf(tv);
  await client.readSystem();
  tv.pairRequest = () => ({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error_id: 'CONCURRENT_PAIRING' }),
  });
  await assert.rejects(client.pairRequest(), {
    kind: ERROR_KINDS.PAIRING,
    errorId: 'CONCURRENT_PAIRING',
  });
  const saphi = clientOf(new FakePhilips({ kind: 'saphi' }));
  await saphi.readSystem();
  await assert.rejects(saphi.pairRequest(), { kind: ERROR_KINDS.UNSUPPORTED });
});
