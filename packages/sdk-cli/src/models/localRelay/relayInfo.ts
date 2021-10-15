import { tmpdir } from 'os';
import { cwd } from 'process';
import { join } from 'path';
import { isInt, readJsonFile } from './util';
import { RELAY_PKG_NAME, RELAY_TMP_NAME } from './const';

export type RelayInfo = { port: number; pid: number };

export type ReadRelayInfoResult = RelayInfo | undefined | false;

export async function readRelayInfo(
  relayTmpName: string = RELAY_TMP_NAME,
): Promise<ReadRelayInfoResult> {
  if (!relayTmpName) {
    throw new Error('No temp directory or file name configured');
  }

  const tmpFilePath = join(tmpdir(), relayTmpName);
  const relayInfo = await readJsonFile<RelayInfo>(tmpFilePath);

  if (!relayInfo) {
    return;
  }

  const { port: parsedPort, pid: parsedPid } = relayInfo;

  // [port, pid].every(...) doesn't pass Control Flow Analysis. I.e. TS won't know port & pid are numbers.
  if (isInt(parsedPort) && isInt(parsedPid)) {
    return {
      port: parseInt((parsedPort as unknown) as string),
      pid: parseInt((parsedPid as unknown) as string),
    };
  }

  return false;
}

export async function pollRelayInfo(): Promise<RelayInfo> {
  let requestInProgress = false;

  const timeoutTime = 15000;
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () =>
        reject(
          `Local Relay launch and temp file update exceeded timeout of ${timeoutTime} ms`,
        ),
      timeoutTime,
    );
  });

  const intervalTime = 500;
  const poll = new Promise<RelayInfo>((resolve) => {
    const interval = setInterval(async () => {
      // Prevent multiple simultaneous requests
      if (requestInProgress) return;

      requestInProgress = true;

      const relayInfo = await readRelayInfo();
      if (relayInfo) {
        clearInterval(interval);
        return resolve(relayInfo);
      }

      requestInProgress = false;
    }, intervalTime);
  });

  return Promise.race([poll, timeout]);
}

// Find the path to relay's entry point (executable) file (package.json -> "main" field)
export async function relayEntryPointPath(
  relayPkgName: string = RELAY_PKG_NAME,
): Promise<string> {
  const pkgPath = join('node_modules', relayPkgName);
  const fullPath = join(cwd(), pkgPath, 'package.json');
  const packageJson = await readJsonFile(fullPath);

  if (!packageJson) {
    throw new Error(`Can\'t read package.json: ${fullPath}`);
  }

  const { main: entryPoint } = packageJson;
  const fullRelayEntryPointPath = join(cwd(), pkgPath, entryPoint);
  return fullRelayEntryPointPath;
}
