import { tmpdir } from 'os';
import { join } from 'path';

export const RELAY_PKG_NAME = '@fitbit/local-developer-relay';
export const RELAY_DIRECTORY_NAME = 'fitbit-local-relay';
export const RELAY_DIRECTORY_PATH = join(tmpdir(), RELAY_DIRECTORY_NAME);

export const RELAY_PID_FILE_NAME = 'pid.json';
export const RELAY_PID_FILE_PATH = join(
  RELAY_DIRECTORY_PATH,
  RELAY_PID_FILE_NAME,
);

export const RELAY_LOG_FILE_NAME = 'logs.txt';
export const RELAY_LOG_FILE_PATH = join(
  RELAY_DIRECTORY_PATH,
  RELAY_LOG_FILE_NAME,
);
