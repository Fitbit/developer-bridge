import { Writable } from 'stream';
import { launch } from './launch';

describe('launch', () => {
  it('logs output to a log stream', async (done) => {
    const logOutput = 'test output';

    const nodeArgs = ['-e', `console.log('${logOutput}')`];
    const subprocess = launch(nodeArgs, 'pipe');

    if (!subprocess.stdout) {
      throw new Error(
        "child_process.spawn()'ed subprocess doesn't have stdout",
      );
    }

    const logStream = new Writable({
      write: (chunk: Buffer) => {
        const data = chunk.toString();
        // The default highWaterMark (buffer/chunk size) for streams is somewhere in KBs,
        // which should be more than enough to get out logOutput in full.
        expect(data).toMatch(logOutput);
        subprocess.kill();
        done();
      },
    });

    subprocess.stdout.pipe(logStream);
  });

  it('logs errors to a log stream', async (done) => {
    const logError = 'test error';
    const logStream = new Writable({
      write: (chunk: Buffer) => {
        const data = chunk.toString();
        expect(data).toMatch(logError);
        done();
      },
    });

    const nodeArgs = ['-e', `console.error('${logError}')`];
    const subprocess = launch(nodeArgs, 'pipe');

    if (!subprocess.stderr) {
      throw new Error(
        "child_process.spawn()'ed subprocess doesn't have stderr",
      );
    }

    subprocess.stderr.pipe(logStream);
  });

  // TODO(future): add tests for detached & unref (i.e. whether parent and child processes are tied)
});
