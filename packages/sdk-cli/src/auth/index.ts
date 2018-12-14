import { AuthorizationRequest } from '@openid/appauth/built/authorization_request';
import {
  AuthorizationNotifier,
  AuthorizationRequestHandler,
} from '@openid/appauth/built/authorization_request_handler';
import { AuthorizationResponse } from '@openid/appauth/built/authorization_response';
import {
  AuthorizationServiceConfiguration,
} from '@openid/appauth/built/authorization_service_configuration';
import * as appAuthFlags from '@openid/appauth/built/flags';
import { NodeBasedHandler, NodeCrypto } from '@openid/appauth/built/node_support';
import { RevokeTokenRequest } from '@openid/appauth/built/revoke_token_request';
import {
  GRANT_TYPE_AUTHORIZATION_CODE,
  GRANT_TYPE_REFRESH_TOKEN,
  TokenRequest,
} from '@openid/appauth/built/token_request';

import environment from './environment';
import storage from './storage';
import FitbitTokenRequestHandler from './FitbitTokenRequestHandler';

// TODO: PR against AppAuth to make this properly configurable
(appAuthFlags as any).IS_LOG = false;

const tokenHandler = new FitbitTokenRequestHandler();

function getAuthConfiguration() {
  const { apiUrl } = environment().config;
  return new AuthorizationServiceConfiguration({
    token_endpoint: `${apiUrl}/oauth2/token`,
    authorization_endpoint: `${apiUrl}/oauth2/authorize`,
    revocation_endpoint: `${apiUrl}/oauth2/revoke`,
  });
}

export async function refreshToken(refreshToken: string) {
  const { clientId } = environment().config;
  try {
    const response = await tokenHandler.performTokenRequest(
      getAuthConfiguration(),
      new TokenRequest({
        client_id: clientId,
        redirect_uri: '', // not needed
        grant_type: GRANT_TYPE_REFRESH_TOKEN,
        refresh_token: refreshToken,
      }),
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

  return new Promise<{
    request: AuthorizationRequest,
    response: AuthorizationResponse,
  }>((resolve, reject) => {
    notifier.setAuthorizationListener((request, response, error) => {
      if (error) {
        if (error.errorDescription) {
          return reject(
            authError(`${error.error}: ${error.errorDescription}`),
          );
        }
        return reject(authError(error.error));
      }
      resolve({ request: request!, response: response! });
    });
  });
}

async function authorize() {
  const { clientId } = environment().config;

  const port = 13579;
  const redirectUri = `http://127.0.0.1:${port}`;

  const authorizationHandler = new NodeBasedHandler(port);
  authorizationHandler.performAuthorizationRequest(
    getAuthConfiguration(),
    new AuthorizationRequest(
      {
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'profile',
        response_type: AuthorizationRequest.RESPONSE_TYPE_CODE,
      },
      new NodeCrypto(),
      true,
    ),
  );

  const { request, response } = await authorizationCallbackPromise(authorizationHandler);
  if (request.state !== response.state) throw authError('Mismatched state');
  return {
    redirectUri,
    code: response.code,
    pkceVerifier: request.internal!['code_verifier'],
  };
}

async function revoke(token: string) {
  await tokenHandler.performRevokeTokenRequest(
    getAuthConfiguration(),
    new RevokeTokenRequest({ token }),
  );
}

export async function login() {
  const { clientId } = environment().config;

  const { code, pkceVerifier, redirectUri } = await authorize();
  const response = await tokenHandler.performTokenRequest(
    getAuthConfiguration(),
    new TokenRequest({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: GRANT_TYPE_AUTHORIZATION_CODE,
      extras: { code_verifier: pkceVerifier },
    }),
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
  // Check for validity without any time buffer.
  if (authData.isValid(0)) return authData.accessToken;
  return refreshToken(authData.refreshToken!);
}
