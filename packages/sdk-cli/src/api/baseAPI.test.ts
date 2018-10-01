import nock from 'nock';

import * as auth from '../auth';
import environment from '../auth/environment';
import * as baseAPI from './baseAPI';

jest.mock('../auth');

const mockAccessTokenContent = 'mockAccess';
const fakeAPIPath = 'fakeAPI';

function mockAuthToken(token: any = mockAccessTokenContent) {
  (auth.getAccessToken as jest.Mock).mockResolvedValueOnce(token);
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
