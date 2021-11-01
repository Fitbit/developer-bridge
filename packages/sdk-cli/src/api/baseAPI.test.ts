import nock from 'nock';

import * as auth from '../auth';
import * as fetchModule from '../fetch';

import environment from '../auth/environment';
import * as baseAPI from './baseAPI';
import makeResponse from '../testUtils/makeResponse';

jest.mock('../auth');

const mockAccessTokenContent = 'mockAccess';
const fakeAPIPath = 'fakeAPI';

function mockAuthToken(token: any = mockAccessTokenContent) {
  (auth.getAccessToken as jest.Mock).mockResolvedValueOnce(token);
}

describe('apiFetch()', () => {
  it('rejects if no auth header is available', () => {
    mockAuthToken(null);
    return expect(
      baseAPI.apiFetch(fakeAPIPath),
    ).rejects.toThrowErrorMatchingSnapshot();
  });

  it('can use a custom API URL and skip auth', async () => {
    jest
      .spyOn(fetchModule, 'default')
      .mockImplementationOnce(
        async (url: RequestInfo, init?: RequestInit) =>
          ({ url, headers: init?.headers } as Response),
      );

    const fakeAPIDomain = 'https://fake-dev-relay-test-endpoint.fitbit.com';

    mockAuthToken(null);
    // apiFetch would throw if it didn't skip auth, because authToken is falsy
    const response = await baseAPI.apiFetch(
      fakeAPIPath,
      undefined,
      fakeAPIDomain,
      false,
    );

    expect(response).toBeDefined();
    expect(auth.getAccessToken).toBeCalledTimes(0);
    expect(response.url).toBe(`${fakeAPIDomain}/${fakeAPIPath}`);
    expect(response.headers.has('authorization')).toBe(false);
  });

  describe('when an auth token is available', () => {
    let endpointScope: nock.Scope;
    beforeEach(() => {
      endpointScope = nock(environment().config.apiUrl, {
        reqheaders: {
          Authorization: `Bearer ${mockAccessTokenContent}`,
        },
      });

      it.each(['GET', 'POST'])(
        'sends an authorization header with requests where method is %s',
        async (method) => {
          const endpointCall = endpointScope
            .intercept(fakeAPIPath, method)
            .reply(200);

          mockAuthToken();
          await baseAPI.apiFetch(fakeAPIPath, { method });
          expect(endpointCall.isDone()).toBe(true);
        },
      );
    });
  });
});

describe('assertAPIResponseOK()', () => {
  it.each([400, 401, 403, 500, 502, 503])(
    'rejects on status code %d with a non-JSON body',
    (status) => {
      return expect(
        baseAPI.assertAPIResponseOK(makeResponse({ status })),
      ).rejects.toThrowErrorMatchingSnapshot();
    },
  );

  it('resolves to a response object on status code 200', () => {
    return expect(
      baseAPI.assertAPIResponseOK(makeResponse()),
    ).resolves.toBeInstanceOf(fetchModule.Response);
  });

  it('parses an error response with a valid JSON body', () => {
    return expect(
      baseAPI.assertAPIResponseOK(
        makeResponse(
          { headers: { 'Content-Type': 'application/json' }, status: 403 },
          JSON.stringify({ errors: [{ message: 'some error' }] }),
        ),
      ),
    ).rejects.toThrowError('some error');
  });

  it('throws an error containing the response body when the error JSON is invalid', () => {
    return expect(
      baseAPI.assertAPIResponseOK(
        makeResponse(
          { headers: { 'Content-Type': 'application/json' }, status: 403 },
          JSON.stringify({ message: 'some error' }),
        ),
      ),
    ).rejects.toThrowErrorMatchingSnapshot();
  });
});
