import { cwd } from 'process';
import { join } from 'path';
import { isInt, readJsonFile } from './util';
import { RELAY_PKG_NAME, RELAY_PID_FILE_PATH } from './const';

export type RelayInfo = { port: number; pid: number };

export type ReadRelayInfoResult = RelayInfo | false;

export async function readRelayInfo(): Promise<ReadRelayInfoResult> {
  try {
    const { port, pid } = await readJsonFile<RelayInfo>(RELAY_PID_FILE_PATH);

    // [port, pid].every(...) doesn't pass Control Flow Analysis. I.e. TS won't know port & pid are numbers.
    if (isInt(port) && isInt(pid)) {
      return {
        port: Number((port as unknown) as string),
        pid: Number((pid as unknown) as string),
      };
    }
  } catch (error) {
    console.error(error);
  }

  return false;
}

export async function pollRelayInfo(
  timeout = 15000,
  interval = 500,
  readRelayInfoFn = readRelayInfo,
): Promise<RelayInfo> {
  let requestInProgress = false;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(
          `Local Relay launch and PID file update exceeded timeout of ${timeout} ms`,
        ),
      timeout,
    );
  });

  const poll = new Promise<RelayInfo>((resolve) => {
    const intervalRef = setInterval(async () => {
      // Prevent multiple simultaneous requests
      if (requestInProgress) return;

      requestInProgress = true;

      const relayInfo = await readRelayInfoFn();
      if (relayInfo) {
        clearInterval(intervalRef);
        return resolve(relayInfo);
      }

      requestInProgress = false;
    }, interval);
  });

  return Promise.race([poll, timeoutPromise]);
}

// Find the path to relay's entry point (executable) file (package.json -> "main" field)
export async function relayEntryPointPath(): Promise<string> {
  const pkgPath = join('node_modules', RELAY_PKG_NAME);
  const fullPath = join(cwd(), pkgPath, 'package.json');

  let entryPoint: string;

  try {
    const packageJson = await readJsonFile<{ main: string }>(fullPath);
    // No "?." — error throw is desired behaviour
    entryPoint = packageJson.main;
  } catch (error) {
    throw new Error(`Can't read package.json: ${fullPath}`);
  }

  if (!entryPoint || entryPoint === '') {
    throw new Error(
      `No 'main' path specified in ${RELAY_PKG_NAME}'s package.json (${fullPath})`,
    );
  }

  return join(cwd(), pkgPath, entryPoint);
}
