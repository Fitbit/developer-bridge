import * as t from 'io-ts';
import { decode } from '@fitbit/jsonrpc-ts';

import * as auth from '../auth';
import environment from '../auth/environment';
import fetch, { Headers } from '../fetch';
import { assertJSON, okOrElse } from '../util/fetchUtil';

// tslint:disable-next-line:variable-name
const APIErrorResponse = t.type(
  {
    errors: t.array(t.type({
      message: t.string,
    })),
  },
  'Hosts403Response',
);
type APIErrorResponse = t.TypeOf<typeof APIErrorResponse>;

export const assertAPIResponseOK = okOrElse((response) => {
  return assertJSON()(response)
    .catch(() => Promise.reject(
      // tslint:disable-next-line:max-line-length
      new Error(`Fetch of ${response.url} returned status ${response.status} ${response.statusText}`),
    ))
    .then(responseObject => Promise.reject(new Error(APIErrorResponse.decode(responseObject).fold(
      // tslint:disable-next-line:max-line-length
      () => `fetch of ${response.url} returned status ${response.status} ${response.statusText} with body: ${JSON.stringify(responseObject, undefined, 2)}`,
      errorObj => errorObj.errors.map(err => err.message).join('\n'),
    )))
    .then(() => Promise.resolve(response)));
});

export const decodeJSON = <A, O, I>(endpointType: t.Type<A, O, I>) =>
  (response: Response): Promise<A> =>
    assertAPIResponseOK(response)
      .then(assertJSON())
      .then(decode(endpointType));

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
