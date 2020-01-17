#!/usr/bin/env node

import os from 'os';
import process from 'process';

import updateNotifier from 'update-notifier';
import vorpal from 'vorpal';

import * as auth from './auth';
import checkForUpdate from './checkForUpdate';
import userProfile from './api/userProfile';

import AppContext from './models/AppContext';
import HostConnections from './models/HostConnections';
import LogConsumer from './models/LogConsumer';
import { formatMessage } from './models/formatMessage';

import build from  './commands/build';
import buildAndInstall from './commands/buildAndInstall';
import connect from  './commands/connect';
import heapSnapshot from './commands/heapSnapshot';
import hosts from './commands/hosts';
import input from './commands/input';
import install from './commands/install';
import logout from  './commands/logout';
import mockHost from './commands/mockHost';
import repl from './commands/repl';
import screenshot from './commands/screenshot';
import setAppPackage from  './commands/setAppPackage';

const enableQACommands = process.env.FITBIT_QA_COMMANDS === '1';

const appContext = new AppContext();
const hostConnections = new HostConnections();

const cli = new vorpal();
cli.history('Fitbit-Command-Line-SDK');
cli.use(build);
cli.use(buildAndInstall({ hostConnections, appContext }));
cli.use(connect({ hostConnections }));
cli.use(heapSnapshot({ hostConnections }));
cli.use(input({ hostConnections }));
cli.use(install({ hostConnections, appContext }));
cli.use(screenshot({ hostConnections }));
cli.use(setAppPackage({ appContext }));
cli.use(logout);
cli.use(repl({ hostConnections }));

if (enableQACommands) {
  cli.use(hosts);
  cli.use(mockHost);
}

new LogConsumer({
  appContext,
  hostConnections,
  messageFormatter: message => formatMessage(cli, message),
});

async function main() {
  checkForUpdate(updateNotifier);

  let accessToken;
  try {
    // Returns null if no token is present, so any exception
    // thrown is a fatal error.
    accessToken = await auth.getAccessToken();
  } catch (ex) {
    console.error(`Failed to read auth token from keychain: ${ex}`);
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
      await auth.login();
    } catch (ex) {
      console.error(`Login failed: ${ex.message}`);
      process.exit(1);
    }
  }

  const user = await userProfile();
  console.log(`Logged in as ${user.fullName} <${user.email}>`);

  cli
    .delimiter('fitbit$')
    .show();
}

main();
