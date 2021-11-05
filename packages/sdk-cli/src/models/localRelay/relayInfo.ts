import { cwd } from 'process';
import { join } from 'path';
import { waitUntil } from 'async-wait-until';

import { isInt, readJsonFile } from './util';
import { RELAY_PKG_NAME, RELAY_PID_FILE_PATH } from './const';

export type RelayInfo = { port: number; pid: number };

export type ReadRelayInfoResult = RelayInfo | false;

export async function readRelayInfo(): Promise<ReadRelayInfoResult> {
  try {
    // Error will be thrown and caught if readJsonFile returns undefined or anything else that can't be destructured
    const { port, pid } = (await readJsonFile(
      RELAY_PID_FILE_PATH,
    )) as RelayInfo;

    // [port, pid].every(...) doesn't pass Control Flow Analysis. I.e. TS won't know port & pid are numbers.
    if (isInt(port) && isInt(pid)) {
      return {
        port: Number(port),
        pid: Number(pid),
      };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(error);
    }
  }

  return false;
}

export async function pollRelayInfo(
  timeout = 15000,
  interval = 300,
): Promise<ReadRelayInfoResult> {
  let relayInfo: ReadRelayInfoResult;

  await waitUntil(async () => Boolean((relayInfo = await readRelayInfo())), {
    timeout,
    intervalBetweenAttempts: interval,
  });

  return relayInfo!;
}

export async function isRelayPkgInstalled(): Promise<boolean> {
  // package.json _must_ be at the project root, and all dependencies _must_ be declared in package.json,
  // so this is standard way to check for installed dependencies.
  try {
    const { dependencies, devDependencies } = (await readJsonFile(
      join(process.cwd(), 'package.json'),
    )) as {
      dependencies: Record<string, any>;
      devDependencies: Record<string, any>;
    };

    return Boolean(
      dependencies?.[RELAY_PKG_NAME] || devDependencies?.[RELAY_PKG_NAME],
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `No package.json found for the project at ${join(
          process.cwd(),
          'package.json',
        )}`,
      );
    }

    throw error;
  }
}

// Find the path to relay's entry point (executable) file (package.json -> "main" field)
export async function relayEntryPointPath(): Promise<string> {
  const pkgPath = join('node_modules', RELAY_PKG_NAME);
  const fullPath = join(cwd(), pkgPath, 'package.json');

  let entryPoint: string;

  try {
    ({ main: entryPoint } = (await readJsonFile(fullPath)) as {
      main: string;
    });
  } catch (error) {
    throw new Error(`Can't read package.json: ${fullPath}`);
  }

  return join(cwd(), pkgPath, entryPoint);
}
