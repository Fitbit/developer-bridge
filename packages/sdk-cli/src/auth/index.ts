import { AuthorizationRequest } from '@openid/appauth/built/authorization_request';
import {
  AuthorizationNotifier,
  AuthorizationRequestHandler,
} from '@openid/appauth/built/authorization_request_handler';
import {
  AuthorizationServiceConfiguration,
} from '@openid/appauth/built/authorization_service_configuration';
import * as appAuthFlags from '@openid/appauth/built/flags';
import { RevokeTokenRequest } from '@openid/appauth/built/revoke_token_request';
import {
  GRANT_TYPE_AUTHORIZATION_CODE,
  GRANT_TYPE_REFRESH_TOKEN,
  TokenRequest,
} from '@openid/appauth/built/token_request';
import { NodeBasedHandler } from '@openid/appauth/built/node_support/node_request_handler';
import crypto from 'crypto';
import randomstring from 'randomstring';

import environment from './environment';
import storage from './storage';
import FitbitTokenRequestHandler from './FitbitTokenRequestHandler';

// TODO: PR against AppAuth to make this properly configurable
(appAuthFlags as any).IS_LOG = false;

const tokenHandler = new FitbitTokenRequestHandler();

function getAuthConfiguration() {
  const { apiUrl } = environment().config;
  return AuthorizationServiceConfiguration.fromJson({
    token_endpoint: `${apiUrl}/oauth2/token`,
    authorization_endpoint: `${apiUrl}/oauth2/authorize`,
    revocation_endpoint: `${apiUrl}/oauth2/revoke`,
  });
}

function base64URLEncode(buf: Buffer) {
  return buf.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
}

export async function refreshToken(refreshToken: string) {
  const { clientId } = environment().config;
  try {
    const response = await tokenHandler.performTokenRequest(
      getAuthConfiguration(),
      new TokenRequest(
        clientId,
        '', // redirect_uri, not needed
        GRANT_TYPE_REFRESH_TOKEN,
        undefined,
        refreshToken,
      ),
    );
    await storage.set(response);
    return response.accessToken;
  } catch (ex) {
    await storage.clear();
    throw ex;
  }
}

function authError(msg: string) {
  return new Error(`Authorization error: ${msg}`);
}

function authorizationCallbackPromise(handler: AuthorizationRequestHandler) {
  const notifier = new AuthorizationNotifier();
  handler.setAuthorizationNotifier(notifier);

  return new Promise<{ state: string, code: string }>((resolve, reject) => {
    notifier.setAuthorizationListener((request, response, error) => {
      if (error) {
        if (error.errorDescription) {
          return reject(
            authError(`${error.error}: ${error.errorDescription}`),
          );
        }
        return reject(authError(error.error));
      }
      resolve(response!);
    });
  });
}

async function authorize() {
  const { clientId } = environment().config;

  const expectedState = randomstring.generate(32);
  const pkceVerifier = base64URLEncode(crypto.randomBytes(32));
  const pkceChallenge = base64URLEncode(
    crypto.createHash('sha256').update((pkceVerifier)).digest(),
  );

  const port = 13579;
  const redirectUri = `http://127.0.0.1:${port}`;

  const authorizationHandler = new NodeBasedHandler(port);
  authorizationHandler.performAuthorizationRequest(
    getAuthConfiguration(),
    new AuthorizationRequest(
      clientId,
      redirectUri,
      'profile',
      AuthorizationRequest.RESPONSE_TYPE_CODE,
      expectedState,
      {
        code_challenge: pkceChallenge,
        code_challenge_method: 'S256',
      },
    ),
  );

  const { state, code } = await authorizationCallbackPromise(authorizationHandler);
  if (state !== expectedState) throw authError('Mismatched state');
  return {
    code,
    pkceVerifier,
    redirectUri,
  };
}

async function revoke(token: string) {
  await tokenHandler.performRevokeTokenRequest(
    getAuthConfiguration(),
    new RevokeTokenRequest(token),
  );
}

export async function login() {
  const { clientId } = environment().config;

  const { code, pkceVerifier, redirectUri } = await authorize();
  const response = await tokenHandler.performTokenRequest(
    getAuthConfiguration(),
    new TokenRequest(
      clientId,
      redirectUri,
      GRANT_TYPE_AUTHORIZATION_CODE,
      code,
      undefined,
      { code_verifier: pkceVerifier },
    ),
  );
  await storage.set(response);
}

export async function logout() {
  const authData = await storage.get();
  if (!authData) return;
  await Promise.all([
    revoke(authData.accessToken),
    storage.clear(),
  ]);
}

export async function getAccessToken() {
  const authData = await storage.get();
  if (authData === null) return null;
  if (authData.isValid()) return authData.accessToken;
  return refreshToken(authData.refreshToken!);
}
