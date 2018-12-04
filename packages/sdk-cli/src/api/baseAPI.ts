import * as t from 'io-ts';

import * as auth from '../auth';
import environment from '../auth/environment';
import fetch, { Headers } from '../fetch';
import { assertJSON } from '../util/fetchUtil';

// tslint:disable-next-line:variable-name
const ErrorResponse = t.type(
  {
    errors: t.array(t.type({
      message: t.string,
    })),
  },
  'Hosts403Response',
);
type ErrorResponse = t.TypeOf<typeof ErrorResponse>;

export const okOrElse = <T>(failure: (response: Response) => Promise<T>) => (response: Response) =>
  response.ok ? Promise.resolve(response) : failure(response);
export const assertOK = okOrElse((response) => {
  return assertJSON()(response)
    .catch(() => Promise.reject(
      // tslint:disable-next-line:max-line-length
      new Error(`Fetch of ${response.url} returned status ${response.status} ${response.statusText}`),
    ))
    .then(responseObject => ErrorResponse.decode(responseObject).getOrElseL(() => {
      // tslint:disable-next-line:max-line-length
      throw new Error(`Fetch of ${response.url} returns status ${response.status} with payload: ${JSON.stringify(responseObject)}`);
    }))
    .then(errorObj => Promise.reject(new Error(errorObj.errors.map(err => err.message).join('\n'))));
});

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
  return fetch(`${environment().config.apiUrl}/${path}`, mergedInit).then(assertOK);
}
