import http from 'node:http';

/**
 * Applies HTTP(S)_PROXY / NO_PROXY from the environment (including values read from
 * .env after start) to fetch() and http(s).request(). Needed where OpenRouter and
 * public sources are reachable only through a local proxy. Returns the proxy in use.
 */
export function applyProxyFromEnv(env = process.env) {
  const proxy = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
  if (!proxy || typeof http.setGlobalProxyFromEnv !== 'function') return null;
  http.setGlobalProxyFromEnv({ HTTPS_PROXY: proxy, HTTP_PROXY: env.HTTP_PROXY || env.http_proxy || proxy,
    NO_PROXY: env.NO_PROXY || env.no_proxy || 'localhost,127.0.0.1,::1' });
  return proxy;
}
