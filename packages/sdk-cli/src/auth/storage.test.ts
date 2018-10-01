import { TokenResponse } from '@openid/appauth/built/token_response';
import keytar from 'keytar';

import storage from './storage';

const mockTime = 1529366247520;
const mockTokenData = {
  access_token: 'access',
  refresh_token: 'refresh',
  issued_at: mockTime,
  expires_in: 3600,
};

jest.mock('keytar', () => {
  return {
    getPassword: jest.fn(),
    setPassword: jest.fn(),
    deletePassword: jest.fn(),
  };
});

let getPasswordSpy: jest.MockInstance<typeof keytar.getPassword>;
let setPasswordSpy: jest.MockInstance<typeof keytar.setPassword>;
let delPasswordSpy: jest.MockInstance<typeof keytar.deletePassword>;

beforeEach(() => {
  getPasswordSpy = jest.spyOn(keytar, 'getPassword');
  setPasswordSpy = jest.spyOn(keytar, 'setPassword');
  delPasswordSpy = jest.spyOn(keytar, 'deletePassword');
  jest.spyOn(Date.prototype, 'getTime').mockReturnValue(mockTime * 1000);
});

describe('set()', () => {
  it('stores tokens', async () => {
    await storage.set(TokenResponse.fromJson({
      access_token: 'access',
      refresh_token: 'refresh',
    }));
    expect(setPasswordSpy.mock.calls[0]).toMatchSnapshot();
  });
});

describe('clear()', () => {
  it('clears tokens', async () => {
    await storage.clear();
    expect(delPasswordSpy).toBeCalledWith('fitbit-sdk', 'production');
  });
});

describe('get()', () => {
  describe('when the user is logged in', () => {
    beforeEach(() => {
      getPasswordSpy.mockResolvedValue(JSON.stringify(mockTokenData));
    });

    it('resolves to a TokenResponse', () =>
      expect(storage.get()).resolves.toBeInstanceOf(TokenResponse));
  });

  describe.each([
    null,
    '{reallynotvalid',
    JSON.stringify({ foo: null }),
  ])(
    'given auth storage content of %s', (storageData) => {
      let getPromise: Promise<TokenResponse | null>;

      beforeEach(() => {
        getPasswordSpy.mockResolvedValue(storageData);
        getPromise = storage.get();
      });

      it('resolves to null', () => expect(getPromise).resolves.toBe(null));

      if (storageData !== null) {
        it('deletes stored content', async () => {
          await getPromise;
          expect(delPasswordSpy).toBeCalled();
        });
      }
    },
  );
});
