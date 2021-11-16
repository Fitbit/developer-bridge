import { join } from 'path';
import * as child_process from 'child_process';
import { createWriteStream, promises as fsPromises } from 'fs';

import { launch } from './launch';
import { RELAY_DIRECTORY_NAME } from './const';

import { mockStreamWithEventEmit } from './index.test';

jest.mock('child_process', () => {
  const actual = jest.requireActual<typeof child_process>('child_process');
  return {
    ...actual,
    spawn: jest.fn().mockImplementation(actual.spawn),
  };
});

describe('launch', () => {
  let subprocess: child_process.ChildProcess;
  let logFilePath: string;

  afterEach(async () => {
    // 'SIGKILL' is guaranteed to terminate Node.js processes.
    // https://nodejs.org/api/process.html#signal-events
    if (subprocess && !subprocess.kill('SIGKILL')) {
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
    async (outputType, consoleMethodName, done) => {
      const logOutput = `test ${outputType}`;
      logFilePath = join(
        RELAY_DIRECTORY_NAME,
        `./launch-test-${outputType}.txt`,
      );
      const logFile = createWriteStream(logFilePath);

      // https://stackoverflow.com/a/44846808/6539857
      // Without 'open' event spawn() won't accept the WriteStream, because
      // "[log stream] must have an underlying descriptor (file streams do not until the 'open' event has occurred)"
      // Related: https://github.com/nodejs/node-v0.x-archive/issues/4030
      logFile.on('open', async (fd) => {
        const nodeArgs = ['-e', `console.${consoleMethodName}('${logOutput}')`];
        subprocess = await launch(nodeArgs, fd);

        // https://nodejs.org/api/child_process.html#event-error
        subprocess.on('error', (error) => {
          return done!(error);
        });

        subprocess.on('close', async () => {
          try {
            await expect(
              fsPromises.readFile(logFilePath, { encoding: 'utf8' }),
            ).resolves.toBe(logOutput + '\n');
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

  it("rejects on child process 'error' event (with processName)", async () => {
    const consoleSpy = jest.spyOn(console, 'error');
    const kill = jest.fn();
    const errorMessage = 'test';
    const processName = 'test';

    const nodeArgs = ['-e', `console.log('smth')`];

    (child_process.spawn as jest.Mock).mockReturnValueOnce(({
      ...mockStreamWithEventEmit('error', new Error(errorMessage)),
      kill,
      unref: jest.fn(),
    } as unknown) as child_process.ChildProcess);

    await expect(
      launch(nodeArgs, undefined as any, processName),
    ).rejects.toThrowError(errorMessage);

    expect(kill).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      `${processName} child process threw error:`,
      new Error(errorMessage),
    );
  });

  it("resolves with child process on 'spawn' event (without processName)", async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    const kill = jest.fn();

    const nodeArgs = ['-e', "console.log('smth')"];
    const expectedProcessName = `Child process spawned by 'node ${nodeArgs[0]} ${nodeArgs[1]}'`;

    (child_process.spawn as jest.Mock).mockReturnValueOnce(({
      ...mockStreamWithEventEmit('spawn'),
      kill,
      unref: jest.fn(),
    } as unknown) as child_process.ChildProcess);

    // ChildProcess class not exported in Node
    await expect(launch(nodeArgs, undefined as any)).resolves.toBeDefined();

    expect(consoleSpy).toHaveBeenCalledWith(`${expectedProcessName} launched`);
  });
});
