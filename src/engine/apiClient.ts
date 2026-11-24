/**
 * Unified authenticated HTTP client for ScalpEngine browser UI.
 * Always attaches session cookies, CSRF client marker header, and handles HTTP 401 session expiry.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-ScalpEngine-Client', '1');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(input, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (res.status === 401 && !input.startsWith('/api/auth/login')) {
    window.dispatchEvent(new CustomEvent('scalpengine:unauthorized'));
  }

  return res;
}
