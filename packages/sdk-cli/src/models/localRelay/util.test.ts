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
  const path: string = join(
    tmpdir(),
    `readJsonFile-test-${RELAY_PID_FILE_NAME}`,
  );

  afterEach(async () => {
    try {
      await fsPromises.unlink(path);
    } catch (error) {
      // It is expected that, in some cases, no file will exist at path
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  });

  it('reads file and returns JSON', async () => {
    const json = { data: 'random' };
    const contents = JSON.stringify(json, null, 2);
    await fsPromises.writeFile(path, contents);

    await expect(readJsonFile(path)).resolves.toEqual(json);
  });

  it("throws on file read error – file doesn't exist", async () => {
    await expect(fsPromises.open(path, 'r')).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readJsonFile(path)).rejects.toThrowError();
  });

  it('throws on file JSON parse error', async () => {
    const contents = 'not json at all';
    await fsPromises.writeFile(path, contents);

    await expect(readJsonFile(path)).rejects.toThrowError();
  });
});
