import * as fsPromises from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { RELAY_PID_FILE_NAME } from './const';
import { isInt, readJsonFile } from './util';

// Have to do this, because 'fsPromises' __must__ be mocked (which sets all fs methods to jest.fn())
jest.mock('fs/promises', () => {
  const actualFs = jest.requireActual('fs/promises') as typeof fsPromises;

  return {
    ...actualFs,
    readFile: jest.fn().mockImplementation(actualFs.readFile),
  };
});

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

describe('readJsonFile', () => {
  describe('actual file system', () => {
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

  describe('mock file system', () => {
    it('reads file and returns JSON', async () => {
      const json = { data: 'random' };
      const contents = JSON.stringify(json, null, 2);

      jest.spyOn(fsPromises, 'readFile').mockResolvedValueOnce(contents);

      await expect(readJsonFile("path doesn't matter")).resolves.toEqual(json);
    });

    it("throws on file read error – file doesn't exist", async () => {
      jest
        .spyOn(fsPromises, 'readFile')
        .mockRejectedValueOnce(new Error('generic read error'));

      await expect(readJsonFile("path doesn't matter")).rejects.toThrowError();
    });

    it('throws on file JSON parse error', async () => {
      const contents = 'not json at all';
      jest.spyOn(fsPromises, 'readFile').mockResolvedValueOnce(contents);

      await expect(readJsonFile("path doesn't matter")).rejects.toThrowError();
    });
  });
});
