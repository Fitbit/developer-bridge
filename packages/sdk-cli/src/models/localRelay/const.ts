import { tmpdir } from 'os';
import { join } from 'path';

export const RELAY_PKG_NAME = '@fitbit/local-developer-relay';
export const RELAY_PID_FILE_NAME = 'fitbit.local-relay.json';

export const RELAY_PID_FILE_PATH = join(tmpdir(), RELAY_PID_FILE_NAME);
