
import os from 'os';

import * as auth from './auth';

async function checkEnvVarLogin() {
  const username = process.env.FITBIT_SDK_USERNAME;
  const password = process.env.FITBIT_SDK_PASSWORD;

  // Neither is set, return false since user wasn't trying to login this way
  if (!username && !password) return false;

  if (!username || !password) {
    console.error('Both FITBIT_SDK_USERNAME and FITBIT_SDK_PASSWORD must be set');
    process.exit(1);
  }

  try {
    await auth.loginResourceOwnerFlow(username, password);
  } catch (ex) {
    console.error(`Resource owner login failed: ${ex.message}`);
    process.exit(1);
  }

  return true;
}

async function checkStoredLogin() {
  let accessToken;
  try {
    // Returns null if no token is present, so any exception
    // thrown is a fatal error.
    accessToken = await auth.getAccessToken();
  } catch (ex) {
    console.error(`Failed to read auth token from keychain: ${ex.message}`);
    if (os.platform() === 'darwin') {
      console.error(
        'Try locking and then unlocking your \'login\' keychain using the Keychain Access app.',
      );
    }
    process.exit(1);
  }

  if (accessToken === null) {
    console.log('No login information, starting login...');
    try {
      await auth.loginAuthCodeFlow();
    } catch (ex) {
      console.error(`Login failed: ${ex.message}`);
      process.exit(1);
    }
  }
}

export default async function checkLogin() {
  // Try to login using username/password from environment variables first if present, if not
  // use stored login and start browser login flow
  if (!await checkEnvVarLogin()) {
    await checkStoredLogin();
  }
}
