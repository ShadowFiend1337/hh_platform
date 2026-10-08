export class ProviderError extends Error {
  constructor(code, retryable = false, retryAfter = 0) { super(code); this.code = code; this.retryable = retryable; this.retryAfter = retryAfter; }
}
export function trustedUrl(value, { development = false, origin } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid integration URL'); }
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(development && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Integration URLs require HTTPS (loopback HTTP allowed in development)');
  }
  if (origin && url.origin !== origin) throw new Error('Provider endpoint must use the configured origin');
  return url;
}

// Provider hosts are operator configuration, never user input. Redirects are
// refused so an upstream redirect cannot send credentials to another host.
export async function remoteText(url, options = {}, fetcher = fetch) {
  let response;
  try { response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000) }); }
  catch { throw new ProviderError('source_unavailable', true); }
  if (!response.ok) {
    await response.body?.cancel();
    if ([401, 403].includes(response.status)) throw new ProviderError('reauthorization_required');
    if (response.status === 404) throw new ProviderError('identity_not_found');
    const retryAfter = Math.min(60, Math.max(0, Number(response.headers.get('retry-after')) || 0));
    throw new ProviderError(response.status === 429 ? 'rate_limited' : 'source_unavailable', response.status === 429 || response.status >= 500, retryAfter);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError('invalid_source_response');
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 1_000_000) { await reader.cancel(); throw new ProviderError('invalid_source_response'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (!(error instanceof SyntaxError)) throw new ProviderError('source_unavailable', true);
    throw new ProviderError('invalid_source_response');
  }
}

export async function remoteJson(url, options = {}, fetcher = fetch) {
  const body = await remoteText(url, options, fetcher);
  try { return JSON.parse(body); } catch { throw new ProviderError('invalid_source_response'); }
}
