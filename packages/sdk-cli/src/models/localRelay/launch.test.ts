import { createWriteStream, promises as fsPromises } from 'fs';
import { ChildProcess } from 'child_process';
import { join } from 'path';

import { launch } from './launch';
import { console } from 'fp-ts';

describe('launch', () => {
  let subprocess: ChildProcess;
  let logFilePath: string;

  afterEach(async () => {
    // 'SIGKILL' is guaranteed to terminate Node.js processes.
    // https://nodejs.org/api/process.html#signal-events
    if (!subprocess.kill('SIGKILL')) {
      console.warn(
        "Couldn't SIGKILL the subprocess. Most probably it has already exited.",
      );
    }

    if (logFilePath) {
      try {
        await fsPromises.unlink(logFilePath);
      } catch (error) {
        if (error !== 'ENOENT') {
          console.error(error);
        }
      }
    }
  });

  it.each<[string, keyof typeof console, jest.DoneCallback?]>([
    ['output', 'log'],
    ['error', 'error'],
  ])(
    'spawns a process and logs %s to a log file',
    (outputType, consoleMethodName, done) => {
      const logOutput = `test ${outputType}`;
      logFilePath = join(__dirname, `./launch-test-${outputType}.txt`);
      const logFile = createWriteStream(logFilePath);

      // https://stackoverflow.com/a/44846808/6539857
      // Without 'open' event spawn() won't accept the WriteStream, because
      // "[log stream] must have an underlying descriptor (file streams do not until the 'open' event has occurred)"
      // Related: https://github.com/nodejs/node-v0.x-archive/issues/4030
      logFile.on('open', (fd) => {
        const nodeArgs = ['-e', `console.${consoleMethodName}('${logOutput}')`];
        subprocess = launch(nodeArgs, fd);

        subprocess.on('error', (error) => {
          return done!(error);
        });

        subprocess.on('close', async () => {
          try {
            await expect(
              fsPromises.readFile(logFilePath, { encoding: 'utf8' }),
            ).resolves.toMatch(logOutput);
          } catch (error) {
            return done!(error);
          }

          return done!();
        });
      });

      logFile.on('error', (error) => {
        return done!(error);
      });
    },
  );
});
