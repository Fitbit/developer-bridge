import { readFile } from 'fs/promises';
import * as child_process from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { cwd } from 'process';

export type RelayInfo = { port: number; pid: number };

export type ReadRelayInfoResult = RelayInfo | undefined | false;

export interface LocalRelay {
  relayPkgName: string;
  relayTmpName: string;
  launch(): Promise<void>;
  relayEntryPointPath(): Promise<string>;
  readRelayInfo(): Promise<ReadRelayInfoResult>;
  pollRelayInfo(): Promise<ReadRelayInfoResult>;
  readJsonFile<T extends Record<string, any> = Record<string, any>>(
    path: string,
  ): Promise<Partial<T> | false>;
  isInt(n: any): n is number;
}

export const RELAY_PKG_NAME = '@fitbit/local-developer-relay';
export const RELAY_TMP_NAME = 'fitbit.local-relay.json';
export function setup(this: LocalRelay) {
  const scope = this;

  return {
    launch,
    relayEntryPointPath,
    readRelayInfo,
    pollRelayInfo,
    readJsonFile,
    isInt,
  };

  async function launch() {
    const relayJsPath = await scope.relayEntryPointPath();
    // FORK:
    // https://nodejs.org/api/child_process.html#child_process_child_process_fork_modulepath_args_options
    // Unlike POSIX fork(), child_process.fork() creates a completely separate V8 process with its own memory.
    // Dangers of POSIX fork() (https://www.evanjones.ca/fork-is-dangerous.html) don't apply.
    child_process.fork(relayJsPath, {
      detached: true,
      // We don't want to read parent's stdin from child process, but we want to share the same stdout/stderr.
      // 'ipc' is fork()'s requirement.
      // https://nodejs.org/api/child_process.html#child_process_child_process_fork_modulepath_args_options
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });

    return scope.pollRelayInfo();
  }

  // Find the path to relay's entry point (executable) file (package.json -> "main" field)
  async function relayEntryPointPath(): Promise<string> {
    const pkgPath = join('node_modules', scope.relayPkgName);
    const fullPath = join(cwd(), pkgPath, 'package.json');
    const packageJson = await scope.readJsonFile(fullPath);

    if (!packageJson) {
      throw new Error(`Can\'t read package.json: ${fullPath}`);
    }

    const { main: entryPoint } = packageJson;
    const fullRelayEntryPointPath = join(cwd(), pkgPath, entryPoint);
    return fullRelayEntryPointPath;
  }

  async function readRelayInfo(): Promise<ReadRelayInfoResult> {
    if (!scope.relayTmpName) {
      throw new Error('No temp directory or file name configured');
    }

    const tmpFilePath = join(tmpdir(), scope.relayTmpName);
    const relayInfo = await scope.readJsonFile<RelayInfo>(tmpFilePath);
    console.log('relayInfo', relayInfo);
    if (!relayInfo) {
      return;
    }

    const { port: parsedPort, pid: parsedPid } = relayInfo;

    // [port, pid].every(...) doesn't pass Control Flow Analysis. I.e. TS won't know port & pid are numbers.
    if (scope.isInt(parsedPort) && scope.isInt(parsedPid)) {
      return {
        port: parseInt((parsedPort as unknown) as string),
        pid: parseInt((parsedPid as unknown) as string),
      };
    }

    return false;
  }

  async function pollRelayInfo(): Promise<RelayInfo> {
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

        const relayInfo = await scope.readRelayInfo();
        if (relayInfo) {
          clearInterval(interval);
          return resolve(relayInfo);
        }

        requestInProgress = false;
      }, intervalTime);
    });

    return Promise.race([poll, timeout]);
  }

  async function readJsonFile<
    T extends Record<string, any> = Record<string, any>
  >(path: string): Promise<Partial<T> | false> {
    let contents: string;

    try {
      contents = await readFile(path, { encoding: 'utf-8' });
    } catch (error) {
      console.log(`Error reading file: ${path}`);
      return false;
    }

    try {
      return JSON.parse(contents);
    } catch (error) {
      console.log(`Error parsing JSON in file, path: ${path}`);
      return {};
    }
  }

  function isInt(n: any): n is number {
    return !isNaN(parseInt(n)) && n === parseInt(n);
  }
}
