// -----------------------------------------------------------------------------
// The network code on a real socket: the fake TV served over HTTP on the
// loopback interface (the tests never leave the machine), a refused port, a
// timeout, an answer too large.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ERROR_KINDS, PhilipsClient } from '../src/philips/client.js';
import { httpRequest } from '../src/philips/http.js';
import { FakePhilips } from './helpers/fakePhilips.js';
import { createPhilipsServer } from './helpers/philipsServer.js';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

test('the Saphi fake TV over real HTTP, through the client', async (t) => {
  const tv = new FakePhilips({ kind: 'saphi' });
  const server = createPhilipsServer(tv);
  const port = await listen(server);
  t.after(() => server.close());
  // The API port is fixed (1925): route it to the test server.
  const request = (url, options) => httpRequest(url.replace(':1925/', `:${port}/`), options);
  const client = new PhilipsClient({ host: '127.0.0.1', request });
  const { info } = await client.readSystem();
  assert.equal(info.model, '50PUS6804/12');
  assert.deepEqual(await client.getPowerState(), { powerstate: 'On' });
  await client.sendKey('Home');
  assert.deepEqual(tv.keys, ['Home']);
});

test('refused, timed out, too large', async (t) => {
  const closed = http.createServer();
  const port = await listen(closed);
  await new Promise((resolve) => closed.close(resolve));
  const client = new PhilipsClient({
    host: '127.0.0.1',
    request: (url, options) => httpRequest(url.replace(':1925/', `:${port}/`), options),
  });
  await assert.rejects(client.getPowerState(), { kind: ERROR_KINDS.UNREACHABLE });

  const slow = http.createServer(() => {});
  const slowPort = await listen(slow);
  t.after(() => slow.closeAllConnections?.() ?? slow.close());
  await assert.rejects(
    httpRequest(`http://127.0.0.1:${slowPort}/6/powerstate`, { timeoutMs: 100 }),
    { code: 'ETIMEDOUT' },
  );

  const big = http.createServer((req, res) => {
    res.writeHead(200);
    res.end(Buffer.alloc(5 * 1024 * 1024, 32));
  });
  const bigPort = await listen(big);
  t.after(() => big.close());
  await assert.rejects(httpRequest(`http://127.0.0.1:${bigPort}/x`), /too large/);
  slow.close();
});
