import * as fs from 'fs';
import * as util from 'util';

import captureScreenshot from './captureScreenshot';
import { RemoteHost } from '@fitbit/fdb-debugger';

const fsPromises = {
  mkdtemp: util.promisify(fs.mkdtemp),
  writeFile: util.promisify(fs.writeFile),
  rm: util.promisify(fs.rm),
};

let tmpDir: string;
let cwd: string;

beforeEach(async () => {
  tmpDir = await fsPromises.mkdtemp('fitbit-sdk-cli-tests');
  cwd = process.cwd();
  process.chdir(tmpDir);
  fsPromises.writeFile('collide.png', Buffer.from('Old file contents'));
});

afterEach(() => {
  process.chdir(cwd);
  return fsPromises.rm(tmpDir, { recursive: true, force: true });
});

describe('when everything should work', () => {
  let takeScreenshot: jest.Mock;
  let result: Promise<void>;

  beforeEach(() => {
    takeScreenshot = jest
      .fn()
      .mockResolvedValue(Buffer.from('P6 1 1 255\n 0 0 0'));

    const host = {
      canTakeScreenshot: () => true,
      screenshotFormats: () => ['P6.sRGB'],
      takeScreenshot: takeScreenshot as any,
    } as RemoteHost;

    result = captureScreenshot(host, 'foo.png');
    return result.then(
      () => {},
      () => {},
    );
  });

  it('resolves', () => expect(result).resolves.toBeUndefined());

  it('takes the screenshot', () =>
    expect(takeScreenshot).toBeCalledWith('P6.sRGB', undefined));

  it('writes the file to disk', () =>
    expect(fs.existsSync('foo.png')).toBe(true));
});

describe.each<[string, string[]]>([
  ['does not suppot screenshots', []],
  ['does not support PPM screenshots', ['GIF', 'WebP']],
])('when the host %s', (_, screenshotFormats) => {
  let result: Promise<void>;

  beforeEach(() => {
    const host = {
      canTakeScreenshot: () => screenshotFormats.length > 0,
      screenshotFormats: () => screenshotFormats.slice(),
    } as RemoteHost;

    result = captureScreenshot(host, 'foo.png');
    return result.then(
      () => {},
      () => {},
    );
  });

  it('rejects', () => {
    return expect(result).rejects.toThrowErrorMatchingSnapshot();
  });

  it('does not create any files', () =>
    expect(fs.existsSync('foo.png')).toBe(false));
});

describe('when destPath is an existing file', () => {
  let result: Promise<void>;
  let mockTakeScreenshot: jest.Mock;

  beforeEach(() => {
    mockTakeScreenshot = jest.fn();

    const host = {
      canTakeScreenshot: () => true,
      screenshotFormats: () => ['P6.sRGB'],
      takeScreenshot: mockTakeScreenshot as any,
    } as RemoteHost;

    result = captureScreenshot(host, 'collide.png');
    return result.then(
      () => {},
      () => {},
    );
  });

  it('rejects', () => {
    return expect(result).rejects.toThrowError(/EEXIST:.*collide.png'/);
  });

  it('does not overwrite the file on disk', () =>
    expect(fs.readFileSync('collide.png', 'utf8')).toBe('Old file contents'));

  it('does not start the screenshot', () =>
    expect(mockTakeScreenshot).not.toBeCalled());
});

describe('when the PPM fails to parse', () => {
  let result: Promise<void>;
  let mockTakeScreenshot: jest.Mock;

  beforeEach(() => {
    mockTakeScreenshot = jest
      .fn()
      .mockResolvedValue(Buffer.from('Not an image'));

    const host = {
      canTakeScreenshot: () => true,
      screenshotFormats: () => ['P6.sRGB'],
      takeScreenshot: mockTakeScreenshot as any,
    } as RemoteHost;

    result = captureScreenshot(host, 'foo.png');
    return result.then(
      () => {},
      () => {},
    );
  });

  it('rejects', () => {
    expect(result).rejects.toThrowErrorMatchingSnapshot();
  });

  it('does not leave a file on disk', () =>
    expect(fs.existsSync('foo.png')).toBe(false));
});
