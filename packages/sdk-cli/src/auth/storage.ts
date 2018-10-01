import { TokenResponse } from '@openid/appauth/built/token_response';
import * as t from 'io-ts';
import keytar from 'keytar';

import environment from './environment';

const keyStoreService = 'fitbit-sdk';
const keyStoreAccount = environment().environment;

// tslint:disable-next-line:variable-name
const AuthStorage = t.interface({
  access_token: t.string,
  refresh_token: t.string,
  issued_at: t.number,
  expires_in: t.number,
});
type AuthStorage = t.TypeOf<typeof AuthStorage>;

function set(tokenResponse: TokenResponse) {
  return keytar.setPassword(
    keyStoreService,
    keyStoreAccount,
    JSON.stringify(tokenResponse.toJson()),
  );
}

async function get(): Promise<TokenResponse | null> {
  const authDataStr = await keytar.getPassword(keyStoreService, keyStoreAccount);
  if (authDataStr === null) return null;
  let authData;
  try {
    authData = JSON.parse(authDataStr);
  } catch (ex) {
    await clear();
    return null;
  }
  if (!AuthStorage.is(authData)) {
    await clear();
    return null;
  }
  return TokenResponse.fromJson(authData);
}

function clear() {
  return keytar.deletePassword(keyStoreService, keyStoreAccount);
}

export default {
  set,
  get,
  clear,
};
