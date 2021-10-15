import * as fs from 'fs/promises';
import { isNumber } from 'lodash';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalRelay } from './LocalRelay';

jest.mock('fs/promises', () => ({
  ...(jest.requireActual('fs/promises') as typeof fs),
  readFile: jest.fn(),
}));

// LocalRelay is a leftover from 'class with static methods' approach.

describe('isInt', () => {
  let isInt: (n: any) => n is number;

  beforeAll(() => {
    isInt = LocalRelay['isInt'];
  });

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
  let readJsonFile: typeof LocalRelay['readJsonFile'];

  beforeAll(() => {
    readJsonFile = LocalRelay['readJsonFile'];
  });

  describe('actual file system', () => {
    const { readFile } = jest.requireActual('fs/promises') as typeof fs;
    let readFileSpy: jest.SpyInstance;

    beforeAll(() => {
      readFileSpy = jest.spyOn(fs, 'readFile').mockImplementation(readFile);
    });

    afterAll(() => {
      readFileSpy.mockRestore();
    });

    it('reads actual file and returns JSON (integration test)', async () => {
      const json = { data: 'random' };
      const contents = JSON.stringify(json, null, 2);

      const path = join(
        tmpdir(),
        `readJsonFile-test-${LocalRelay.relayTmpName}`,
      );
      await fs.writeFile(path, contents);

      await expect(readJsonFile(path)).resolves.toEqual(json);

      await fs.unlink(path);
    });

    it("returns false on actual file read error (integration test) – file doesn't exist", async () => {
      const path = join(
        tmpdir(),
        `readJsonFile-test-${LocalRelay.relayTmpName}`,
      );
      await expect(fs.open(path, 'r')).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(readJsonFile(path)).resolves.toBe(false);
    });

    it('returns empty object on actual JSON file parse error', async () => {
      const contents = 'not json at all';
      const path = join(
        tmpdir(),
        `readJsonFile-test-${LocalRelay.relayTmpName}`,
      );
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

describe('readRelayInfo', () => {
  let readJsonFileSpy: jest.SpyInstance;
  // let readRelayInfoSpy: jest.SpyInstance;

  beforeAll(() => {
    readJsonFileSpy = jest
      // @ts-ignore
      .spyOn(LocalRelay.prototype, 'readJsonFile')
      .mockImplementation((async () => 'based') as any);
  });

  afterAll(() => {
    // readJsonFileSpy.mockRestore();
  });

  it('throws if no relay temp file name is defined', async () => {
    const saved = LocalRelay.relayTmpName;
    LocalRelay.relayTmpName = undefined as any;

    await expect(LocalRelay.readRelayInfo()).rejects.toMatchObject({
      message: 'No temp directory or file name configured',
    });

    LocalRelay.relayTmpName = saved;
  });

  describe('reads', () => {
    it.only('returns relay info (port, pid)', async () => {
      const port = 5;
      const pid = 7;
      expect(isNumber(port)).toBe(true);
      expect(isNumber(pid)).toBe(true);

      console.log(await LocalRelay.readJsonFile('a'));
      await expect(LocalRelay.readRelayInfo()).resolves.toBe(true);
    });

    it('terminates with void if readJsonFile indicates error (return: false)', async () => {
      (readJsonFileSpy as jest.Mock).mockResolvedValueOnce(false);
      await expect(LocalRelay.readRelayInfo()).resolves.toBeUndefined();
    });

    it('terminates with false if no relay info has been obtained', async () => {
      (readJsonFileSpy as jest.Mock).mockResolvedValueOnce({});
      await expect(LocalRelay.readRelayInfo()).resolves.toBe(false);
    });

    it('terminates with false if port from relay info is not a number ', async () => {
      const port = 'not a number';
      const pid = 5;
      expect(isNumber(port)).toBe(false);
      expect(isNumber(pid)).toBe(true);

      (readJsonFileSpy as jest.Mock).mockResolvedValueOnce({ port, pid });
      await expect(LocalRelay.readRelayInfo()).resolves.toBe(false);
    });

    it('terminates with false if pid from relay info is not a number ', async () => {
      const port = 5;
      const pid = 'not a number';
      expect(isNumber(port)).toBe(true);
      expect(isNumber(pid)).toBe(false);

      (readJsonFileSpy as jest.Mock).mockResolvedValueOnce({ port, pid });
      await expect(LocalRelay.readRelayInfo()).resolves.toBe(false);
    });
  });
});
