import * as os from 'os';
import { join } from 'path';

export const maxPayload = 1024 * 1024;

export const relayPkgName = '@fitbit/local-developer-relay';
export const relayDirectoryName = 'fitbit-local-relay';
export const relayDirectoryPath = join(os.tmpdir(), relayDirectoryName);

export const relayPidFileName = 'pid.json';
export const relayPidFilePath = join(relayDirectoryPath, relayPidFileName);
