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

  // Official docs use fs.openSync, which returns a file descriptor integer.
  // In our case, using a Writable Stream is more intuitive.
  const out = createWriteStream(RELAY_LOG_FILE_PATH, { flags: 'a' });
  const err = createWriteStream(RELAY_LOG_FILE_PATH, { flags: 'a' });

  // FORK:
  // https://nodejs.org/api/child_process.html#child_process_child_process_fork_modulepath_args_options
  // Unlike POSIX fork(), child_process.fork() creates a completely separate V8 process with its own memory.
  // Dangers of POSIX fork() (https://www.evanjones.ca/fork-is-dangerous.html) don't apply.
  const relayChildProcess = child_process.fork(relayJsPath, {
    detached: true,
    /**
     * 0: stdin  – We don't want to read parent's stdin.
     * 1: stdout – Log any child process messages to a file. Could also be 'inherit', to let child's messages appear in the
     *             parent's console, however, it isn't compatible with `detached: true`
     *             ("...provided with a stdio configuration that is not connected to the parent"):
     *             https://nodejs.org/api/child_process.html#optionsdetached
     *             Plus, we want to be able to read child process output even after the parent exits.
     *             [TODO]: Ask StackOverflow about what exactly is meant by "stdio configuration", because even "inherit"
     *             seems to work on test tasks. Maybe only "stdin" is meant?
     * 2: stderr – Log any child process errors to a file. See 1:stdout above.
     * 3: ipc    – Having an 'ipc' channel is a requirement for using `fork()`.
     *             See: https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options -> options.stdio
     *             [CONFUSING]: conflicts with https://nodejs.org/api/child_process.html#optionsdetached
     */
    stdio: ['ignore', out, err, 'ipc'],
  });

  // unref()'ing child process allows the parent process (CLI) to exit without waiting for the child (Local Relay) to exit.
  relayChildProcess.unref();

  return pollRelayInfo();
}
