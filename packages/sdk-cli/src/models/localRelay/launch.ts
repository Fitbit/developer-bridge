import { Writable } from 'stream';
import { ChildProcess, spawn } from 'child_process';

export function launch(
  nodeArgs: string[],
  logStream: Writable | number | 'pipe' | 'ignore' | 'inherit',
  processName?: string,
): Promise<ChildProcess> {
  // Fork() doesn't support unref()
  const childProcess = spawn('node', nodeArgs, {
    detached: true,
    /**
     * 1. IMPORTANT: because both stdout and stderr are piped to the same file, it's a good idea to
     *    explicitly differentiate log and error messages in the child process,
     *    i.e. with "LOG: ..." and "ERROR: ...".
     *
     * 2. Could be ['ignore', 'inherit', 'inherit'], to let child's messages appear in the parent's console.
     *    However, 'inherit' isn't compatible with 'detached: true':
     *    https://nodejs.org/api/child_process.html#optionsdetached
     *    "...provided with a stdio configuration that is not connected to the parent"):
     */
    stdio: ['ignore', logStream, logStream],
  });

  // unref()'ing child process allows the parent process (CLI) to exit without waiting for the child (Local Relay) to exit.
  childProcess.unref();

  const childProcessName = processName
    ? `${processName} child process`
    : `Child process spawned by 'node ${nodeArgs.join(' ')}'`;

  return new Promise<ChildProcess>((resolve, reject) => {
    childProcess.on('spawn', () => {
      console.log(`${childProcessName} launched`);
      return resolve(childProcess);
    });

    childProcess.on('error', (error: Error) => {
      console.error(`${childProcessName} threw error:`, error);
      // 'error' doesn't guarantee that the process exits afterwards,
      // so the process is explicitly killed just in case.
      childProcess.kill('SIGKILL');
      // https://nodejs.org/api/child_process.html#event-error
      // There are 3 cases in which 'error' can arise; rejecting the launch promise inside
      // the event listener  handles only the case when the child process couldn't be spawned.
      // However, the other 2 cases are not applicable in our case: the only place the child process
      // is killed is here, and we don't use IPC channel/pipes to communicate between processes.
      // Handling only the 'error on spawn' case is okay.
      return reject(error);
    });

    childProcess.on('close', async () => {
      console.warn(`${childProcessName} closed`);
    });
  });
}
