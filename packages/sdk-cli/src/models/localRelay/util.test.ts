import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { RELAY_TMP_NAME } from './const';
import { isInt, readJsonFile } from './util';

// Have to do this, because 'fs' __must__ be mocked (which sets all fs methods to jest.fn())
jest.mock('fs/promises', () => {
  const actualFs = jest.requireActual('fs/promises') as typeof fs;

  return {
    ...actualFs,
    readFile: jest.fn().mockImplementation(actualFs.readFile),
  };
});

describe('isInt', () => {
  describe('false', () => {
    it('undefined', () => expect(isInt(undefined)).toBe(false));
    it('null', () => expect(isInt(null)).toBe(false));
    it('Infinity', () => expect(isInt(Infinity)).toBe(false));
    it('-Infinity', () => expect(isInt(-Infinity)).toBe(false));
    it('number string', () => expect(isInt('5')).toBe(false));
  });

  describe('true', () => {
    it('number', () => expect(isInt(5)).toBe(true));
  });
});

describe('readJsonFile', () => {
  describe('actual file system', () => {
    it('reads actual file and returns JSON (integration test)', async () => {
      const json = { data: 'random' };
      const contents = JSON.stringify(json, null, 2);

      const path = join(tmpdir(), `readJsonFile-test-${RELAY_TMP_NAME}`);
      await fs.writeFile(path, contents);

      await expect(readJsonFile(path)).resolves.toEqual(json);

      await fs.unlink(path);
    });

    it("returns false on actual file read error (integration test) – file doesn't exist", async () => {
      const path = join(tmpdir(), `readJsonFile-test-${RELAY_TMP_NAME}`);
      await expect(fs.open(path, 'r')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(readJsonFile(path)).resolves.toBe(false);
    });

    it('returns empty object on actual JSON file parse error', async () => {
      const contents = 'not json at all';
      const path = join(tmpdir(), `readJsonFile-test-${RELAY_TMP_NAME}`);
      await fs.writeFile(path, contents);

      await expect(readJsonFile(path)).resolves.toEqual({});

      await fs.unlink(path);
    });
  });

  describe('mock file system', () => {
    it('reads file and returns JSON', async () => {
      const json = { data: 'random' };
      const contents = JSON.stringify(json, null, 2);

      jest.spyOn(fs, 'readFile').mockResolvedValueOnce(contents);

      await expect(readJsonFile("path doesn't matter")).resolves.toEqual(json);
    });

    it('returns false on file read error – generic error', async () => {
      jest
        .spyOn(fs, 'readFile')
        .mockRejectedValueOnce(() => new Error('generic read error'));
      await expect(readJsonFile("path doesn't matter")).resolves.toBe(false);
    });

    it('returns empty object on JSON parse error', async () => {
      const contents = 'not json at all';
      jest.spyOn(fs, 'readFile').mockResolvedValueOnce(contents);

      await expect(readJsonFile("path doesn't matter")).resolves.toEqual({});
    });
  });
});
