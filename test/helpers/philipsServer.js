// -----------------------------------------------------------------------------
// The fake TV of the tests (fakePhilips.js) over real HTTP(S): used by
// test/http.test.js on the loopback interface, and by the Docker checks,
// where it plays the TV next to the integration container:
//
//   PHILIPS_KIND=saphi node test/helpers/philipsServer.js       # HTTP on 1925
//   PHILIPS_TLS_KEY=key.pem PHILIPS_TLS_CERT=cert.pem \
//     node test/helpers/philipsServer.js                         # Android, HTTPS on 1926
//
// The certificate is the caller's (a throwaway self-signed one): none is kept
// in the repository.
// -----------------------------------------------------------------------------

import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FakePhilips } from './fakePhilips.js';

/**
 * @param {FakePhilips} tv
 * @param {{ key: string|Buffer, cert: string|Buffer }} [tls] HTTPS when given
 * @returns {http.Server}
 */
export function createPhilipsServer(tv, tls) {
  const handler = (req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      const answer = await tv.handle({
        url: `${tls ? 'https' : 'http'}://${req.headers.host ?? 'localhost'}${req.url}`,
        method: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(answer.status, answer.headers);
      res.end(answer.body);
    });
  };
  return tls ? https.createServer(tls, handler) : http.createServer(handler);
}

if (process.argv[1] === fileURLToPath(import.meta.url) && !process.env.NODE_TEST_CONTEXT) {
  const kind = process.env.PHILIPS_KIND === 'saphi' ? 'saphi' : 'android';
  const tv = new FakePhilips({ kind, power: process.env.PHILIPS_POWER || 'On' });
  const tls =
    kind === 'android'
      ? {
          key: readFileSync(process.env.PHILIPS_TLS_KEY),
          cert: readFileSync(process.env.PHILIPS_TLS_CERT),
        }
      : undefined;
  const port = Number(process.env.PORT || tv.port);
  createPhilipsServer(tv, tls).listen(port, () => {
    console.log(`Fake Philips TV (${kind}) listening on port ${port}, pairing PIN ${tv.pin}`);
  });
  // Every 20 s, someone takes the remote: the scene event has something to say.
  let turn = 0;
  setInterval(() => {
    const step = turn % 3;
    turn += 1;
    if (step === 0) {
      tv.showNetflix();
    } else if (step === 1) {
      tv.watchChannel(1649);
    } else {
      tv.watchHdmi();
    }
    console.log(
      `Remote: step ${step}; keys so far: ${tv.keys.join(', ') || 'none'}; launches: ${tv.launches.length}; paired clients: ${tv.clients.size}`,
    );
  }, 20_000).unref();
}
