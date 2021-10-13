import nock from 'nock';

jest.mock('../auth');
import * as auth from '../auth';
// Wrap export to an object to be able to mock the default export using spyOn(fetchModule, 'default')
import * as fetchModule from '../fetch';

import environment from '../auth/environment';
import * as baseAPI from './baseAPI';
import makeResponse from '../testUtils/makeResponse';

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

  it("doesn't authenticate if shouldAuth = false", async () => {
    const response = await baseAPI.apiFetch(
      fakeAPIPath,
      undefined,
      undefined,
      false,
    );
    expect(response).toBeDefined();

    // ASK: Is it lower- or upper-case? Case-insensitive?
    expect(response.headers.has('authorization')).toBe(false);
    expect(response.headers.has('Authorization')).toBe(false);
  });

  it('uses a custom API URL when specified', async () => {
    jest
      // ASK: is there a way to jest.mock('../fetch'), but RETAIN the original fetch() implementation,
      // EXCEPT only if I explicitly do mockImpl/Return/etc?
      .spyOn(fetchModule, 'default')
      // ASK: mock implementation without type errors? E.g. just "(url: string) => url"
      .mockImplementationOnce(async (url: string | RequestInfo) => url as any);

    const fakeApiUrl = 'https://fakeurl.com';
    // ASK Style conflict: fakeAPIPath vs fakeApiUrl
    const response = await baseAPI.apiFetch(
      fakeAPIPath,
      undefined,
      fakeApiUrl,
      false,
    );

    return expect(response).toBe(`${fakeApiUrl}/${fakeAPIPath}`);
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
