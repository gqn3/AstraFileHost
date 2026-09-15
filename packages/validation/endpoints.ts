// Shared by the server configuration check and the browser transfer scheduler.
export function isLoopbackHost(host: string) {
  return host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\./.test(host);
}
export function validateBrowserEndpoint(application: string, storage: string) {
  const app = new URL(application), endpoint = new URL(storage);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password)
    throw new Error('Storage endpoint must be an HTTP(S) origin without credentials.');
  if (app.protocol === 'https:' && endpoint.protocol !== 'https:')
    throw new Error('Storage endpoint must use HTTPS when the website uses HTTPS.');
  if (!isLoopbackHost(app.hostname) && (isLoopbackHost(endpoint.hostname) || !endpoint.hostname.includes('.') && !endpoint.hostname.includes(':')))
    throw new Error('Storage endpoint must be reachable from the browser; localhost and internal service names are invalid for a public website.');
}
