export function authHeaders(extra: HeadersInit = {}) {
  const token = sessionStorage.getItem('rs-token');
  return { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra };
}

export function jsonHeaders(extra: HeadersInit = {}) {
  return authHeaders({ 'content-type': 'application/json', ...extra });
}
