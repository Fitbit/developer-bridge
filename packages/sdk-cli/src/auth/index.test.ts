import { TokenResponse, TokenResponseJson } from '@openid/appauth/built/token_response';
import nock from 'nock';
import opener from 'opener';
import url from 'url';

import * as auth from '.';
import environment from './environment';
import fetch from '../fetch';
import mockWithPromiseWaiter from '../testUtils/mockWithPromiseWaiter';
import storage from './storage';
import { NodeCrypto } from '@openid/appauth/built/node_support';

jest.mock('./storage');
jest.mock('opener');

const mockUsername = 'test@example.com';
const mockPassword = 'p@ssw0rd';

const mockTime = 1529366247520;

const mockTokenResponseData: TokenResponseJson = {
  access_token: 'newAccess',
  refresh_token: 'newRefresh',
  token_type: 'bearer',
  expires_in: 60,
};

const mockTokenStorageData = {
  ...mockTokenResponseData,
  issued_at: mockTime,
};

let getAuthStorageSpy: jest.SpyInstance;
let setAuthStorageSpy: jest.SpyInstance;
let clearAuthStorageSpy: jest.SpyInstance;
let callbackURLPromise: Promise<string>;

function mockTokenResponse(code = 200, body: {} = mockTokenResponseData) {
  return nock(environment().config.apiUrl)
    .post('/oauth2/token')
    .reply(code, body);
}

function mockTokenResponseError(status = 500, errorType = 'internal_error') {
  mockTokenResponse(status, {
    errors: [
      {
        errorType,
        message: 'Something went wrong!',
      },
    ],
    success: false,
  });
}

function mockRevokeResponse(code = 200) {
  return nock(environment().config.apiUrl)
    .post('/oauth2/revoke')
    .reply(code);
}

function mockStoredAuthData(data = mockTokenStorageData) {
  getAuthStorageSpy.mockReset();
  getAuthStorageSpy.mockResolvedValueOnce(
    new TokenResponse(data),
  );
}

function mockEmptyAuthData() {
  getAuthStorageSpy.mockReset();
  getAuthStorageSpy.mockResolvedValueOnce(null);
}

function getCallbackURLPromise() {
  const openerPromise = mockWithPromiseWaiter<string>(opener as jest.Mock);
  return openerPromise.then((authorizeUrlStr) => {
    const authorizeUrl = new url.URL(authorizeUrlStr);
    const redirectUri = authorizeUrl.searchParams.get('redirect_uri') as string;
    return redirectUri;
  });
}

beforeEach(() => {
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');

  getAuthStorageSpy = jest.spyOn(storage, 'get');
  setAuthStorageSpy = jest.spyOn(storage, 'set');
  clearAuthStorageSpy = jest.spyOn(storage, 'clear');
  jest.spyOn(Date.prototype, 'getTime').mockReturnValue(mockTime * 1000);
});

afterEach(() => nock.cleanAll());

describe('getAccessToken()', () => {
  const authStorageTemplate = {
    ...mockTokenResponseData,
    access_token: 'access',
    refresh_token: 'refresh',
  };

  it('returns null if storage is empty', () => {
    mockEmptyAuthData();
    return expect(auth.getAccessToken()).resolves.toBe(null);
  });

  it('returns access token if storage contains valid, unexpired tokens', () => {
    mockStoredAuthData();
    return expect(auth.getAccessToken()).resolves.toBe('newAccess');
  });

  describe('if the token is expired', () => {
    beforeEach(() => {
      mockStoredAuthData({
        ...authStorageTemplate,
        issued_at: mockTime - 300,
      });
    });

    it('refreshes token and returns if required', () => {
      mockTokenResponse();
      return expect(auth.getAccessToken()).resolves.toBe(mockTokenResponseData.access_token);
    });

    it('stores newly refreshed tokens', async () => {
      mockTokenResponse();
      await auth.getAccessToken();
      expect(setAuthStorageSpy).toBeCalledWith(new TokenResponse(mockTokenResponseData));
    });

    it('clears auth storage if refresh fails', async () => {
      mockTokenResponseError();
      await expect(auth.getAccessToken()).rejects.toBeDefined();
      expect(clearAuthStorageSpy).toBeCalled();
    });
  });
});

describe('loginAuthCodeFlow()', () => {
  beforeEach(() => {
    jest.spyOn(NodeCrypto.prototype, 'generateRandom')
      .mockReturnValue('fixedstate');
    callbackURLPromise = getCallbackURLPromise();
  });

  afterEach(async () => {
    // Call the authorize callback just in case the test didn't
    // so that the server doesn't remain running after the test completes.
    try {
      await fetch(await callbackURLPromise);
    } catch (ex) {}
  });

  it('retrieves and stores an auth token', async () => {
    const mockTokenEndpoint = mockTokenResponse();
    const loginPromise = auth.loginAuthCodeFlow();
    await fetch(`${await callbackURLPromise}?state=fixedstate&code=__valid_code__`);
    await loginPromise;

    expect(mockTokenEndpoint.isDone()).toBe(true);
    expect(setAuthStorageSpy).toBeCalledWith(new TokenResponse(mockTokenResponseData));
  });

  describe.each([
    'state=_invalid_&code=__valid_code__',
    'state=fixedstate&error=internal_error',
    'state=fixedstate&error=internal_error&error_description=Something+went+very_wrong',
  ])('given authorization callback parameters %s', (queryParams) => {
    it('rejects', async () => {
      const loginExpectPromise = expect(auth.loginAuthCodeFlow()).rejects
        .toThrowErrorMatchingSnapshot();
      await fetch(`${await callbackURLPromise}?${queryParams}`);
      return loginExpectPromise;
    });
  });

  it('rejects if token response returns a 500 status code', async () => {
    mockTokenResponseError();
    const loginPromise = auth.loginAuthCodeFlow();
    await fetch(`${await callbackURLPromise}?state=fixedstate&code=__valid_code__`);
    return expect(loginPromise).rejects.toThrowErrorMatchingSnapshot();
  });

  it('rejects if token response is empty', async () => {
    mockTokenResponse(200, {});
    const loginPromise = auth.loginAuthCodeFlow();
    await fetch(`${await callbackURLPromise}?state=fixedstate&code=__valid_code__`);
    return expect(loginPromise).rejects.toThrowErrorMatchingSnapshot();
  });
});

describe('loginResourceOwnerFlow()', () => {
  it('retrieves and stores an auth token', async () => {
    const mockTokenEndpoint = mockTokenResponse();
    const loginPromise = auth.loginResourceOwnerFlow(mockUsername, mockPassword);
    await expect(loginPromise).resolves.toBeUndefined();

    expect(mockTokenEndpoint.isDone()).toBe(true);
    expect(setAuthStorageSpy).toBeCalledWith(new TokenResponse(mockTokenResponseData));
  });

  it('rejects if token response returns a 500 status code', async () => {
    mockTokenResponseError();
    const loginPromise = auth.loginResourceOwnerFlow(mockUsername, mockPassword);
    return expect(loginPromise).rejects.toThrowErrorMatchingSnapshot();
  });

  it('rejects if token response is empty', async () => {
    mockTokenResponse(200, {});
    const loginPromise = auth.loginResourceOwnerFlow(mockUsername, mockPassword);
    return expect(loginPromise).rejects.toThrowErrorMatchingSnapshot();
  });
});

describe('logout()', () => {
  describe('when a user is logged in', () => {
    beforeEach(() => {
      mockStoredAuthData();
      clearAuthStorageSpy.mockReturnValueOnce(Promise.resolve());
    });

    it('deletes stored keychain data', async () => {
      mockRevokeResponse();
      await auth.logout();
      expect(clearAuthStorageSpy).toBeCalled();
    });

    it('revokes the access token', async () => {
      const revokeEndpointMock = mockRevokeResponse();
      await auth.logout();
      expect(revokeEndpointMock.isDone()).toBe(true);
    });
  });

  it('is a no-op if a user is not logged in', async () => {
    return expect(auth.logout()).resolves.toBeUndefined();
  });
});
