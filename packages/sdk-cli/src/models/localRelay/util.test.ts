import { promises as fsPromises } from 'fs';
import { isPositiveInt, readJsonFile } from './util';

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
