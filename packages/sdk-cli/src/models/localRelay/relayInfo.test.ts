import { join } from 'path';
import { cwd } from 'process';

import * as util from './util';
import { RELAY_PKG_NAME } from './const';
import {
  pollRelayInfo,
  readRelayInfo,
  relayEntryPointPath,
  RelayInfo,
} from './relayInfo';

describe('readRelayInfo', () => {
  it.each([
    {
      readJsonFileValue: { port: 5, pid: 7 },
      readRelayInfoValue: { port: 5, pid: 7 },
      name: 'returns relay info (port, pid) if both are valid numbers',
    },
    {
      readJsonFileValue: { port: 5, pid: '7' },
      readRelayInfoValue: false,
      name: 'returns false if pid is not a number',
    },
    {
      readJsonFileValue: { port: '5', pid: 7 },
      readRelayInfoValue: false,
      name: 'returns false if port is not a number',
    },
    {
      readJsonFileValue: 'obviously not JSON containing Relay Info',
      readRelayInfoValue: false,
      name: 'returns false if no relay info has been obtained',
    },
    {
      readJsonFileValue: { not: 'keys we expect' },
      readRelayInfoValue: false,
      name: 'returns false if no relay info has been obtained',
    },
  ])('$name', async ({ readJsonFileValue, readRelayInfoValue }) => {
    jest
      .spyOn(util, 'readJsonFile')
      .mockResolvedValueOnce(readJsonFileValue as any);

    await expect(readRelayInfo()).resolves.toEqual(readRelayInfoValue);
  });

  describe('handles errors', () => {
    it("doesn't log error if file doesn't exist", async () => {
      jest
        .spyOn(util, 'readJsonFile')
        .mockRejectedValueOnce({ code: 'ENOENT' });

      const consoleErrorSpy = jest.spyOn(console, 'error');

      await expect(readRelayInfo()).resolves.toBe(false);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("logs error on any error except ENOENT: file doesn't exist ...", async () => {
      jest
        .spyOn(util, 'readJsonFile')
        .mockRejectedValueOnce({ code: 'random' });

      const consoleErrorSpy = jest.spyOn(console, 'error');

      await expect(readRelayInfo()).resolves.toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});

describe('pollRelayInfo', () => {
  /**
   * Poll for the relay info in interval of 100ms until either:
   * - Valid relay info obtained
   * - Timeout
   *
   * Here, we need 3 function calls to obtain valid relay info, and the interval is 100ms –
   * more than enough time for us to poll relay info and not time out.
   */
  it('polls until relay info is obtained', async () => {
    const relayInfo: RelayInfo = { port: 1, pid: 1 };
    const readJsonFileSpy = jest
      .spyOn(util, 'readJsonFile')
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(relayInfo);

    await expect(pollRelayInfo(500, 100)).resolves.toEqual(relayInfo);

    expect(readJsonFileSpy).toHaveBeenCalledTimes(3);
  });

  /**
   * With timeout 3500ms, and interval 1000ms, pollRelayInfo can only make max. 3 poll calls + 1 initial, at t = 0.
   * We check whether polls are really called in the specified interval and not slower/faster (so exactly 3 times).
   * setInterval/Timeout/etc. are not guaranteed to call functions at __exactly__ the time specified,
   * so there is a margin of 500ms (3 x 1000ms + 500ms).
   */
  it('polls in regular intervals', async () => {
    const timeout = 3500;
    const interval = 1000;
    const readJsonFileSpy = jest
      .spyOn(util, 'readJsonFile')
      .mockResolvedValue({});

    await expect(pollRelayInfo(timeout, interval)).rejects.toThrow();

    // Calls: 0, 1000, 2000, 3000
    expect(readJsonFileSpy).toHaveBeenCalledTimes(
      Math.floor(timeout / interval) + 1,
    );

    readJsonFileSpy.mockReset();
  });

  /**
   * With timeout 10 times larger than the interval, pollRelayInfo could be called 10 times.
   * However, we set the first poll request's execution time at almost the timeline length – 800ms.
   * The request is successful, so the interval should be cleared and value returned.
   * Therefore, we check whether the interval is blocked whenever there is an existing request in-flight.
   */
  it('has only 1 in-flight poll request at a time', async () => {
    const timeout = 1000;
    const interval = 100;
    const pollExecTime = 800;

    const value: RelayInfo = { port: 1, pid: 1 };
    const readJsonFileSpy = jest.spyOn(util, 'readJsonFile').mockImplementation(
      () =>
        new Promise<RelayInfo>((resolve) =>
          setTimeout(() => resolve(value), pollExecTime),
        ),
    );

    await expect(pollRelayInfo(timeout, interval)).resolves.toEqual(value);

    expect(readJsonFileSpy).toHaveBeenCalledTimes(
      Math.floor(timeout / pollExecTime),
    );

    readJsonFileSpy.mockReset();
  });

  /**
   * First poll request's execution time 2000ms exceeds the total specified 1000ms timeout.
   */
  it('rejects on timeout', async () => {
    const timeout = 1000;
    const readJsonFileSpy = jest.spyOn(util, 'readJsonFile').mockImplementation(
      () =>
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000)),
    );

    await expect(pollRelayInfo(timeout, undefined)).rejects.toHaveProperty(
      'message',
      `Timed out after waiting for ${timeout} ms`,
    );

    readJsonFileSpy.mockReset();
  });
});

describe('relayEntryPointPath', () => {
  it(`reads package.json of ${RELAY_PKG_NAME} and gets its main file path`, async () => {
    const main = 'index.ts';

    jest.spyOn(util, 'readJsonFile').mockResolvedValueOnce({ main });

    await expect(relayEntryPointPath()).resolves.toMatch(
      join(cwd(), 'node_modules', RELAY_PKG_NAME, main),
    );
  });

  it(`reads package.json of ${RELAY_PKG_NAME} and gets its main file path`, async () => {
    jest.spyOn(util, 'readJsonFile').mockResolvedValueOnce(undefined as any);

    await expect(relayEntryPointPath()).rejects.toThrowError(
      "Can't read package.json:",
    );
  });

  it(`reads package.json of ${RELAY_PKG_NAME} and gets its main file path`, async () => {
    const main = undefined;
    jest.spyOn(util, 'readJsonFile').mockResolvedValueOnce({ main });

    await expect(relayEntryPointPath()).rejects.toThrowError(
      `The "path" argument must be of type string. Received ${typeof main}`,
    );
  });
});
