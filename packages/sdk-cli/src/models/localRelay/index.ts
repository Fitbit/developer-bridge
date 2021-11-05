import { createWriteStream } from 'fs';

import { RELAY_LOG_FILE_PATH } from './const';
import { launch } from './launch';
import {
  RelayInfo,
  readRelayInfo,
  relayEntryPointPath,
  pollRelayInfo,
} from './relayInfo';

export async function instance(): Promise<RelayInfo> {
  // Connect to any existing Relay instance; if doesn't exist, launch a new one.
  const existingRelayInfo = await readRelayInfo();
  if (existingRelayInfo) return existingRelayInfo;

  const relayJsPath = await relayEntryPointPath();
  const logStream = createWriteStream(RELAY_LOG_FILE_PATH);

  await launch([relayJsPath], logStream);
  const relayInfo = await pollRelayInfo();
  if (!relayInfo)
    throw new Error("Couldn't obtain Local Relay port and pid from PID file");
  return relayInfo;
}

export { RelayInfo } from './relayInfo';
