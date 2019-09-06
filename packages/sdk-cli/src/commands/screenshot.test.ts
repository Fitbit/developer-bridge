import * as path from 'path';

import mockdate from 'mockdate';
import vorpal from 'vorpal';
import { default as openScreenshot } from 'open';

import screenshot from './screenshot';
import captureScreenshot from '../models/captureScreenshot';
import HostConnections from '../models/HostConnections';
import commandTestHarness from '../testUtils/commandTestHarness';
import { homedir } from 'os';

jest.mock('../models/captureScreenshot');
jest.mock('open');

const screenshotMock = captureScreenshot as jest.Mock<Promise<void>>;

let cli: vorpal;
let mockLog: jest.Mock;
let mockUIRedraw: vorpal.Redraw;
let hostConnections: HostConnections;

beforeEach(() => {
  // The mock date is set to local time intentionally. The default
  // screenshot file name is constructed from the current time in the
  // user's local time zone, not UTC.
  mockdate.set(new Date(2018, 2, 4, 15, 6, 7, 8));
  screenshotMock.mockImplementation(() => fail('captureScreenshot unexpectedly called'));
  hostConnections = {} as HostConnections;
  ({ cli, mockLog, mockUIRedraw } = commandTestHarness(screenshot({ hostConnections })));
});

afterEach(() => mockdate.reset());

it('handles not being connected', async () => {
  await cli.exec('screenshot');
  expect(mockLog).toBeCalledWith('Not connected to a device');
});

it('prints screenshot capture errors to the console', async () => {
  hostConnections.appHost = { host: jest.fn() } as any;
  screenshotMock.mockRejectedValue(new Error('Out of film'));
  await cli.exec('screenshot');
  expect(mockUIRedraw).toBeCalledWith('Error: Out of film');
  expect(mockUIRedraw.done).toBeCalled();
});

// A Jest bug makes it more difficult to test path- and CWD-related
// code as os.homedir(), path.cwd() and the like cannot be mocked.
// https://github.com/facebook/jest/issues/2549

async function expectCaptureScreenshotCall(expected: string, path?: string, open?: boolean) {
  hostConnections.appHost = { host: jest.fn() } as any;
  screenshotMock.mockResolvedValue(undefined);
  await cli.exec('screenshot', { path, options: { open } });
  const filePath = screenshotMock.mock.calls[0][1];
  expect(filePath).toBe(expected);
}

it('defaults to saving the screenshot to a date-derived filename', () =>
  expectCaptureScreenshotCall(path.resolve('Screenshot 2018-03-04 at 15.06.07.png')));

it('writes to a path relative to the cwd', () =>
  expectCaptureScreenshotCall(path.join(process.cwd(), 'asdf', 'foo.png'), 'asdf/foo.png'));

it('untildifies the given path', () =>
  expectCaptureScreenshotCall(path.join(homedir(), 'foo.png'), '~/foo.png'));

it('logs the location of the file to the console', async () => {
  const destPath = path.resolve('foo.png');
  await expectCaptureScreenshotCall(destPath, 'foo.png');
  expect(mockUIRedraw).toBeCalledWith(`Screenshot saved to ${destPath}`);
  expect(mockUIRedraw.done).toBeCalled();
});

it('opens the screenshot', async () => {
  const destPath = path.resolve('Screenshot 2018-03-04 at 15.06.07.png');
  await expectCaptureScreenshotCall(destPath, undefined, true);

  await expect(openScreenshot).toBeCalledWith(destPath, { wait: false });
});

describe('during the screenshot capture', () => {
  let onWrite: (received: number, total?: number) => void;

  beforeEach((done) => {
    hostConnections.appHost = { host: jest.fn() } as any;
    screenshotMock.mockImplementation((host, destPath, options) => {
      onWrite = options.onWrite;
      done();
      return new Promise(() => {});
    });

    cli.exec('screenshot');
  });

  it('displays progress when total is unknown', () => {
    onWrite(100);
    expect(mockUIRedraw).toBeCalledWith('Downloading...');
  });

  it('displays progress percentage when total is known', () => {
    onWrite(1, 3);
    expect(mockUIRedraw).toBeCalledWith('Downloading: 33% completed');
  });

  it('displays 100% progress when download is complete', () => {
    onWrite(123, 123);
    expect(mockUIRedraw).toBeCalledWith('Downloading: 100% completed');
  });
});
