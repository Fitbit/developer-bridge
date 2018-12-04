import { decode } from '@fitbit/jsonrpc-ts';
import * as t from 'io-ts';

export const assertContentType = (expected: string) => (response: Response) => {
  // Parameters of media types are ignored.
  const contentTypeHeader = response.headers.get('content-type') || '';
  const contentType = contentTypeHeader.split(';', 1)[0];
  if (contentType !== expected) {
    return Promise.reject(
      new Error(`Unexpected Content-Type: expected '${expected}', got '${contentType}'`),
    );
  }
  return Promise.resolve(response);
};

export const assertJSON = (expected = 'application/json') => async (response: Response) => {
  await assertContentType(expected)(response);
  return response.json();
};

export const decodeJSON = <A, O, I>(endpointType: t.Type<A, O, I>) =>
  (response: Response): Promise<A> =>
    assertJSON()(response)
      .then(decode(endpointType));
