// -----------------------------------------------------------------------------
// The one function that talks to the network: an HTTP(S) request to the TV, on
// node:http / node:https. Not on fetch: the Android TVs serve HTTPS on port
// 1926 with a self-signed certificate, which node:https accepts per request.
//
// The client takes this function as a parameter: the tests replace it with an
// in-memory TV (test/helpers/fakePhilips.js).
// -----------------------------------------------------------------------------

import http from 'node:http';
import https from 'node:https';

// The largest answers are the application and channel lists: a few hundred KB.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

// A few kept-alive sockets per TV, as the Philips app does: the TV's web
// server is small, and a new TLS handshake for each of the reads of a poll
// costs it more than the reads themselves.
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 2 });
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 2,
  // TVs only have self-signed certificates.
  rejectUnauthorized: false,
});

/**
 * @param {string} url absolute URL
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {Record<string, string>} [options.headers]
 * @param {string} [options.body]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ status: number, headers: Record<string, string|string[]>, body: string }>}
 */
export function httpRequest(url, { method = 'GET', headers = {}, body, timeoutMs = 8_000 } = {}) {
  const target = new URL(url);
  const isHttps = target.protocol === 'https:';
  const payload = body === undefined ? undefined : Buffer.from(body);
  const requestHeaders = {
    ...headers,
    ...(payload ? { 'content-length': payload.length } : {}),
  };

  return new Promise((resolve, reject) => {
    const request = (isHttps ? https : http).request(
      target,
      {
        method,
        headers: requestHeaders,
        timeout: timeoutMs,
        agent: isHttps ? httpsAgent : httpAgent,
      },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            request.destroy(new Error('Response too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        response.on('error', reject);
      },
    );
    request.on('timeout', () => {
      const error = new Error(`Timed out after ${timeoutMs} ms`);
      error.code = 'ETIMEDOUT';
      request.destroy(error);
    });
    request.on('error', reject);
    request.end(payload);
  });
}
