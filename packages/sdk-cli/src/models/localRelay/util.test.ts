import { promises as fsPromises } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { RELAY_PID_FILE_NAME } from './const';
import { isInt, readJsonFile } from './util';

describe('isInt', () => {
  describe('false', () => {
    it.each([undefined, null, Infinity, -Infinity])('%s', (x) =>
      expect(isInt(x)).toBe(false),
    );

    it('number string', () => expect(isInt('5')).toBe(false));
  });

  describe('true', () => {
    it('number', () => expect(isInt(5)).toBe(true));
  });
});

describe('readJsonFile – actual file system', () => {
  it('reads file and returns JSON', async () => {
    const json = { data: 'random' };
    const contents = JSON.stringify(json, null, 2);

    const path = join(tmpdir(), `readJsonFile-test-${RELAY_PID_FILE_NAME}`);
    await fsPromises.writeFile(path, contents);

    await expect(readJsonFile(path)).resolves.toEqual(json);

    await fsPromises.unlink(path);
  });

  it("throws on file read error – file doesn't exist", async () => {
    const path = join(tmpdir(), `readJsonFile-test-${RELAY_PID_FILE_NAME}`);
    // Delete the file just in case
    try {
      await fsPromises.unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    await expect(fsPromises.open(path, 'r')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readJsonFile(path)).rejects.toThrowError();
  });

  it('throws on file JSON parse error', async () => {
    const contents = 'not json at all';
    const path = join(tmpdir(), `readJsonFile-test-${RELAY_PID_FILE_NAME}`);
    await fsPromises.writeFile(path, contents);

    await expect(readJsonFile(path)).rejects.toThrowError();

    await fsPromises.unlink(path);
  });
});
