import { createWriteStream } from 'fs';
import * as child_process from 'child_process';
import {
  relayEntryPointPath,
  pollRelayInfo,
  RelayInfo,
  readRelayInfo,
  ReadRelayInfoResult,
} from './relayInfo';
import { RELAY_LOG_FILE_PATH } from './const';

export { RelayInfo } from './relayInfo';

export async function instance(): Promise<RelayInfo> {
  // Connect to any existing Relay instance; if doesn't exist, launch a new one.
  const relayInfo = (await readRelayInfo()) || (await launch());

  if (!relayInfo) {
    throw new Error("Couldn't obtain Local Relay port and pid from PID file");
  }

  return relayInfo;
}

async function launch(): Promise<ReadRelayInfoResult> {
  const relayJsPath = await relayEntryPointPath();
  const out = createWriteStream(RELAY_LOG_FILE_PATH, { flags: 'a' });

  // Fork() doesn't support unref()
  const relayChildProcess = child_process.spawn('node', [relayJsPath], {
    detached: true,
    // Could be ['ignore', 'inherit', 'inherit'], to let child's messages appear in the parent's console.
    // However, 'inherit' isn't compatible with 'detached: true':
    // https://nodejs.org/api/child_process.html#optionsdetached
    // "...provided with a stdio configuration that is not connected to the parent"):
    stdio: ['ignore', out, out],
  });

  // unref()'ing child process allows the parent process (CLI) to exit without waiting for the child (Local Relay) to exit.
  relayChildProcess.unref();

  return pollRelayInfo();
}
