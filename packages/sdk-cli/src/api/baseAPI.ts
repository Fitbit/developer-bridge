import * as auth from '../auth';
import environment from '../auth/environment';
import fetch, { Headers } from '../fetch';
import { decodeJSON } from '../util/fetchUtil';

export async function apiFetch(path: string, init: RequestInit = {}) {
  const authToken = await auth.getAccessToken();
  if (!authToken) throw new Error(`Fetch of ${path} failed: no stored auth token`);

  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${authToken}`);
  const mergedInit: RequestInit = {
    cache: 'no-store',
    ...init,
    headers,
  };
  return fetch(`${environment().config.apiUrl}/${path}`, mergedInit);
}

export { decodeJSON };
