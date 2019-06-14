import * as fs from 'fs';

import mockFS from 'mock-fs';

import captureScreenshot from './captureScreenshot';
import { RemoteHost } from '@fitbit/fdb-debugger';

// mockFS is a bit problematic to use when mixed with snapshot tests
// as the snapshots hit the mock FS instead of the real one!
// We have to be careful to call mockFS.restore() before invoking any
// Jest matchers that use snapshots. You'll know when this has been
// missed in a test if you see Jest logging that it has written
// snapshots on every test run.
beforeEach(() => mockFS({
  'collide.png': 'Old file contents',
}));

afterEach(() => mockFS.restore());

describe('when everything should work', () => {
  let takeScreenshot: jest.Mock;
  let result: Promise<void>;

  beforeEach(() => {
    takeScreenshot = jest.fn().mockResolvedValue(Buffer.from('P6 1 1 255\n 0 0 0'));

    const host = {
      canTakeScreenshot: () => true,
      screenshotFormats: () => ['P6.sRGB'],
      takeScreenshot: takeScreenshot as any,
    } as RemoteHost;

    result = captureScreenshot(host, 'foo.png');
    return result.then(() => {}, () => {});
  });

  it('resolves', () => expect(result).resolves.toBeUndefined());

  it('takes the screenshot', () => expect(takeScreenshot).toBeCalledWith('P6.sRGB', undefined));

  it('writes the file to disk', () => expect(fs.existsSync('foo.png')).toBe(true));
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
    return result.then(() => {}, () => {});
  });

  it('rejects', () => {
    mockFS.restore();
    return expect(result).rejects.toThrowErrorMatchingSnapshot();
  });

  it('does not create any files', () => expect(fs.existsSync('foo.png')).toBe(false));
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
    return result.then(() => {}, () => {});
  });

  it('rejects', () => {
    mockFS.restore();
    return expect(result).rejects.toThrowError(/EEXIST,.*'collide.png'/);
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
    mockTakeScreenshot = jest.fn().mockResolvedValue(Buffer.from('Not an image'));

    const host = {
      canTakeScreenshot: () => true,
      screenshotFormats: () => ['P6.sRGB'],
      takeScreenshot: mockTakeScreenshot as any,
    } as RemoteHost;

    result = captureScreenshot(host, 'foo.png');
    return result.then(() => {}, () => {});
  });

  it('rejects', () => {
    mockFS.restore();
    expect(result).rejects.toThrowErrorMatchingSnapshot();
  });

  it('does not leave a file on disk', () => expect(fs.existsSync('foo.png')).toBe(false));
});
