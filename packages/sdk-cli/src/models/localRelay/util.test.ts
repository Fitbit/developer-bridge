import * as fs from 'fs';
import { join } from 'path';
import { mockStreamWithEventEmit } from './index.test';
import { isPositiveInt, readJsonFile, createLogStream } from './util';

jest.mock('fs', () => {
  const actual: typeof fs = jest.requireActual('fs');

  return {
    ...actual,
    createWriteStream: jest.fn(),
    promises: { ...actual.promises, readFile: jest.fn(), mkdir: jest.fn() },
  };
});

describe('isPositiveInt', () => {
  describe('false', () => {
    it.each([undefined, null, Infinity, -Infinity])('%s', (x) =>
      expect(isPositiveInt(x)).toBe(false),
    );

    it.each([
      ['number string', '5'],
      ['negative number', -5],
      ['float', 3.14],
    ])('%s', (_, test) => {
      expect(isPositiveInt(test)).toBe(false);
    });

    it('number string', () => expect(isPositiveInt('5')).toBe(false));
    it('number string', () => expect(isPositiveInt('5')).toBe(false));
    it('number string', () => expect(isPositiveInt('5')).toBe(false));
  });

  describe('true', () => {
    it('number', () => expect(isPositiveInt(5)).toBe(true));
  });
});

describe('readJsonFile – mock file system', () => {
  it('reads file and returns JSON', async () => {
    const json = { data: 'random' };
    const contents = JSON.stringify(json, null, 2);

    jest.spyOn(fs.promises, 'readFile').mockResolvedValueOnce(contents);

    await expect(readJsonFile("path doesn't matter")).resolves.toEqual(json);
  });

  it("throws on file read error – file doesn't exist", async () => {
    jest
      .spyOn(fs.promises, 'readFile')
      .mockRejectedValueOnce(new Error('generic read error'));

    await expect(readJsonFile("path doesn't matter")).rejects.toThrowError();
  });

  it('throws on file JSON parse error', async () => {
    const contents = 'not json at all';
    jest.spyOn(fs.promises, 'readFile').mockResolvedValueOnce(contents);

    await expect(readJsonFile("path doesn't matter")).rejects.toThrowError();
  });
});

describe('createLogStream', () => {
  const parentDir = '/non/existent';
  const fullPath = join(parentDir, 'dir');

  beforeEach(() => {
    jest
      .spyOn(fs, 'createWriteStream')
      .mockReturnValueOnce(mockStreamWithEventEmit('open') as fs.WriteStream);
  });

  it("creates a directory if doesn't exist already", async () => {
    const mkdirSpy = jest
      .spyOn(fs.promises, 'mkdir')
      .mockImplementationOnce(jest.fn());

    await expect(createLogStream(fullPath)).resolves.toBeDefined();

    expect(mkdirSpy).toHaveBeenCalledWith(parentDir, expect.anything());
  });

  it('ignores error if directory exists already', async () => {
    jest.spyOn(fs.promises, 'mkdir').mockRejectedValueOnce({ code: 'EEXIST' });
    await expect(createLogStream(fullPath)).resolves.toBeDefined();
  });

  it('ignores error if directory exists already', async () => {
    const code = 'ANOTHER_CODE';

    jest.spyOn(fs.promises, 'mkdir').mockRejectedValueOnce({ code });

    await expect(createLogStream(fullPath)).rejects.toHaveProperty(
      'code',
      code,
    );
  });
});
