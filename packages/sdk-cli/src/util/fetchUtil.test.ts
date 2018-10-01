import { Response } from '../fetch';
import * as fetchUtil from './fetchUtil';

function makeResponse(
  init: ResponseInit = { status: 200 },
  body = '{}',
) {
  const response = new Response(
    body,
    {
      statusText: `Status ${init.status}`,
      ...init,
    },
  );

  Object.defineProperty(response, 'url', {
    value: 'http://api',
    writable: false,
  });

  return response;
}

describe('assertOK()', () => {
  it.each([
    400,
    401,
    403,
    500,
    502,
    503,
  ])('rejects on status code %d', (status) => {
    return expect((fetchUtil.assertOK(makeResponse({ status }))),
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('resolves to a response object on status code 200', () => {
    return expect(fetchUtil.assertOK(makeResponse())).resolves.toBeInstanceOf(Response);
  });
});

describe('assertJSON()', () => {
  it.each([
    'application/text',
    'image/png',
    undefined,
  ])('rejects on Content-Type header of %s', (contentType) => {
    return expect(
      fetchUtil.assertJSON()(
        makeResponse({ headers: { 'Content-Type': contentType } }),
      ),
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it.each([
    'application/json',
    'application/json; charset=utf-8',
  ])('resolves on Content-Type header of %s', (contentType) => {
    return expect(
      fetchUtil.assertJSON()(
        makeResponse({ headers: { 'Content-Type': contentType } }),
      ),
    ).resolves.toEqual({});
  });

  it('rejects if the response is not valid JSON', () => {
    return expect(
      fetchUtil.assertJSON()(
        makeResponse(
          { headers: { 'Content-Type': 'application/json' } },
          '{notvalid',
        ),
      ),
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('accepts an alternative Content-Type to assert', () => {
    return expect(
      fetchUtil.assertJSON('application/vnd.document+json')(
        makeResponse({ headers: { 'Content-Type': 'application/vnd.document+json' } }),
      ),
    ).resolves.toEqual({});
  });
});
