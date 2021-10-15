import * as child_process from 'child_process';
import { relayEntryPointPath, pollRelayInfo } from './relayInfo';

export default async function launch() {
  const relayJsPath = await relayEntryPointPath();
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

  return pollRelayInfo();
}
