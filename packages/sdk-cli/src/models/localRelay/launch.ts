import { ChildProcess, spawn } from 'child_process';
import { Writable } from 'stream';

export function launch(
  nodeArgs: string[],
  logStream: Writable | 'pipe' | 'ignore' | 'inherit',
): ChildProcess {
  // Fork() doesn't support unref()
  const relayChildProcess = spawn('node', nodeArgs, {
    detached: true,
    // Could be ['ignore', 'inherit', 'inherit'], to let child's messages appear in the parent's console.
    // However, 'inherit' isn't compatible with 'detached: true':
    // https://nodejs.org/api/child_process.html#optionsdetached
    // "...provided with a stdio configuration that is not connected to the parent"):
    stdio: ['ignore', logStream, logStream],
  });

  // unref()'ing child process allows the parent process (CLI) to exit without waiting for the child (Local Relay) to exit.
  relayChildProcess.unref();

  return relayChildProcess;
}
