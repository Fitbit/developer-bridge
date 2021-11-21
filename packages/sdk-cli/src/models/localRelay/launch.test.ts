import { join } from 'path';
import * as child_process from 'child_process';
import { promises as fsPromises } from 'fs';

import { launch } from './launch';
import { createLogStream } from './util';
import { RELAY_DIRECTORY_NAME } from './const';
import { mockStreamWithEventEmit } from './index.test';

jest.mock('child_process', () => {
  const actual = jest.requireActual<typeof child_process>('child_process');
  return {
    ...actual,
    spawn: jest.fn().mockImplementation(actual.spawn),
  };
});

async function awaitProcessClose(
  processPromise: Promise<child_process.ChildProcess>,
): Promise<child_process.ChildProcess> {
  return new Promise(async (resolve, reject) => {
    try {
      const resolvedProcess = await processPromise;
      resolvedProcess.on('close', async () => resolve(resolvedProcess));
    } catch (error) {
      return reject(error);
    }
  });
}

describe('launch', () => {
  const logDirPath = join(process.cwd(), RELAY_DIRECTORY_NAME);

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
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(error);
        }
      }
    }
  });

  afterAll(async () => {
    try {
      await fsPromises.rmdir(logDirPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(error);
      }
    }
  });

  it.skip.each<[string, keyof typeof console, jest.DoneCallback?]>([
    ['output', 'log'],
    ['error', 'error'],
  ])(
    'spawns a process and logs %s to a log file',
    async (outputType, consoleMethodName) => {
      const logOutput = `test ${outputType}`;
      logFilePath = join(logDirPath, `./launch-test-${outputType}.txt`);
      const logFile = await createLogStream(logFilePath);

      // https://stackoverflow.com/a/44846808/6539857
      // Without 'open' event spawn() won't accept the WriteStream, because
      // "[log stream] must have an underlying descriptor (file streams do not until the 'open' event has occurred)"
      // Related: https://github.com/nodejs/node-v0.x-archive/issues/4030
      const nodeArgs = [
        '-e',
        `console.${consoleMethodName}('${logOutput}'); process.exit();`,
      ];
      const subprocessPromise = launch(nodeArgs, logFile);

      // TODO: Use toBeInstanceOf(ChildProcess), resolve typing issue
      await expect(subprocessPromise).resolves.toHaveProperty(
        'constructor.name',
        'ChildProcess',
      );

      // Log files aren't guaranteed to exist after 'spawn' event (which subprocessPromise resolves on),
      // wait for 'close'.
      subprocess = await awaitProcessClose(subprocessPromise);

      await expect(
        fsPromises.readFile(logFilePath, { encoding: 'utf8' }),
      ).resolves.toBe(logOutput + '\n');
    },
  );

  it("resolves with child process on 'spawn' event (without processName)", async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    const kill = jest.fn();

    const nodeArgs = ['-e', "console.log('smth'); process.exit();"];
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

  it("rejects on child process 'error' event (with processName)", async () => {
    const consoleSpy = jest.spyOn(console, 'error');
    const kill = jest.fn();
    const errorMessage = 'test';
    const processName = 'test';

    const nodeArgs = ['-e', `console.log('smth'); process.exit();`];

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

  it('warns when the child process has closed (with processName)', async () => {
    const consoleSpy = jest.spyOn(console, 'warn');
    const processName = 'test';

    const nodeArgs = ['-e', `console.log('smth'); process.exit();`];

    (child_process.spawn as jest.Mock).mockReturnValueOnce(({
      ...mockStreamWithEventEmit('close'),
      unref: jest.fn(),
    } as unknown) as child_process.ChildProcess);

    await expect(
      launch(nodeArgs, undefined as any, processName),
    ).rejects.toThrowError(
      `${processName} child process exited without 'spawn' or 'error' events firing`,
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      `${processName} child process closed`,
    );
  });
});
