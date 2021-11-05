import { createWriteStream } from 'fs';

import { RELAY_LOG_FILE_PATH, RELAY_PKG_NAME } from './const';
import { launch } from './launch';
import {
  RelayInfo,
  readRelayInfo,
  relayEntryPointPath,
  pollRelayInfo,
  isRelayPkgInstalled,
} from './relayInfo';

export async function instance(): Promise<RelayInfo> {
  // Connect to any existing Relay instance; if doesn't exist, launch a new one.
  const existingRelayInfo = await readRelayInfo();
  if (existingRelayInfo) return existingRelayInfo;

  if (!(await isRelayPkgInstalled())) {
    throw new Error(
      `To use local relay (-l, --local flag), you should have ${RELAY_PKG_NAME} installed. No ${RELAY_PKG_NAME} dependency found in package.json`,
    );
  }

  const relayJsPath = await relayEntryPointPath();
  const logStream = createWriteStream(RELAY_LOG_FILE_PATH);

  await launch([relayJsPath], logStream);
  const relayInfo = await pollRelayInfo();
  if (!relayInfo)
    throw new Error("Couldn't obtain Local Relay port and pid from PID file");
  return relayInfo;
}

export { RelayInfo } from './relayInfo';
