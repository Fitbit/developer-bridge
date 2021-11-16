import { createWriteStream, promises as fsPromises, WriteStream } from 'fs';
import { dirname } from 'path';

export async function readJsonFile(path: string): Promise<unknown> {
  const contents = await fsPromises.readFile(path, { encoding: 'utf-8' });
  return JSON.parse(contents);
}

export function isPositiveInt(n: any): n is number {
  return n >= 0 && Number.isInteger(n);
}

export async function createLogStream(path: string): Promise<WriteStream> {
  const dir = dirname(path);

  try {
    await fsPromises.mkdir(dir, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }

  return new Promise<WriteStream>((resolve, reject) => {
    const writeStream = createWriteStream(path);
    // https://stackoverflow.com/a/44846808/6539857
    // Without 'open' event spawn() won't accept the WriteStream, because
    // "[log stream] must have an underlying descriptor (file streams do not until the 'open' event has occurred)"
    // Related: https://github.com/nodejs/node-v0.x-archive/issues/4030
    writeStream.on('open', () => resolve(writeStream)).on('error', reject);
  });
}
