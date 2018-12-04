import nock from 'nock';

import * as auth from '../auth';
import environment from '../auth/environment';
import * as baseAPI from './baseAPI';
import { Response } from '../fetch';

jest.mock('../auth');

const mockAccessTokenContent = 'mockAccess';
const fakeAPIPath = 'fakeAPI';

function mockAuthToken(token: any = mockAccessTokenContent) {
  (auth.getAccessToken as jest.Mock).mockResolvedValueOnce(token);
}

function makeResponse(
  init: ResponseInit = { status: 200 },
  body = '{}',
) {
  return new Response(body, {
    statusText: `Status ${init.status}`,
    ...init,
  });
}

describe('apiFetch()', () => {
  it('rejects if no auth header is available', () => {
    mockAuthToken(null);
    return expect(baseAPI.apiFetch(fakeAPIPath)).rejects.toThrowErrorMatchingSnapshot();
  });

  describe('when an auth token is available', () => {
    let endpointScope: nock.Scope;
    beforeEach(() => {
      endpointScope = nock(
        environment().config.apiUrl,
        {
          reqheaders: {
            Authorization: `Bearer ${mockAccessTokenContent}`,
          },
        },
      );

      it.each([
        'GET',
        'POST',
      ])('sends an authorization header with requests where method is %s', async (method) => {
        const endpointCall = endpointScope
          .intercept(fakeAPIPath, method)
          .reply(200);

        mockAuthToken();
        await baseAPI.apiFetch(fakeAPIPath, { method });
        expect(endpointCall.isDone()).toBe(true);
      });
    });
  });
});

describe('assertOK()', () => {
  it.each([
    400,
    401,
    403,
    500,
    502,
    503,
  ])('rejects on status code %d with a non-JSON body', (status) => {
    return expect((baseAPI.assertOK(makeResponse({ status }))),
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('resolves to a response object on status code 200', () => {
    return expect(baseAPI.assertOK(makeResponse())).resolves.toBeInstanceOf(Response);
  });

  it('parses an error response with a valid JSON body', () => {
    return expect((baseAPI.assertOK(makeResponse(
      { headers: { 'Content-Type': 'application/json' }, status: 403 },
      JSON.stringify({ errors: [{ message: 'some error' }] }),
    )))).rejects.toThrowError('some error');
  });

  it('throws an error containing the response body when the error JSON is invalid', () => {
    return expect((baseAPI.assertOK(makeResponse(
      { headers: { 'Content-Type': 'application/json' }, status: 403 },
      JSON.stringify({ message: 'some error' }),
    )))).rejects.toThrowErrorMatchingSnapshot();
  });
});
