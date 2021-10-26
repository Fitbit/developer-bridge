import { join } from 'path';
import { cwd } from 'process';
import { RELAY_PKG_NAME } from './const';
import {
  pollRelayInfo,
  readRelayInfo,
  relayEntryPointPath,
  RelayInfo,
} from './relayInfo';
import * as util from './util';

describe('readRelayInfo', () => {
  describe.each([
    {
      isPortValid: true,
      isPidValid: true,
      readJsonFileValue: { port: 5, pid: 7 },
      readRelayInfoValue: { port: 5, pid: 7 },
    },
    {
      isPortValid: true,
      isPidValid: false,
      readJsonFileValue: { port: 5, pid: '7' },
      readRelayInfoValue: false,
    },
    {
      isPortValid: false,
      isPidValid: true,
      readJsonFileValue: { port: '5', pid: 7 },
      readRelayInfoValue: false,
    },
    {
      readJsonFileValue: 'obviously not JSON containing Relay Info',
      readRelayInfoValue: false,
    },
    {
      readJsonFileValue: { not: 'keys we expect' },
      readRelayInfoValue: false,
    },
  ])(
    'reads',
    ({ isPortValid, isPidValid, readJsonFileValue, readRelayInfoValue }) => {
      const [resultName, conditionName] =
        isPortValid && isPidValid
          ? ['relay info (port, pid)', 'both are valid numbers']
          : isPortValid
          ? ['false', 'port is not a number']
          : isPidValid
          ? ['false', 'pid is not a number']
          : ['false', 'no relay info has been obtained'];

      it(`returns ${resultName} if ${conditionName}`, async () => {
        jest
          .spyOn(util, 'readJsonFile')
          .mockResolvedValueOnce(readJsonFileValue as any);

        await expect(readRelayInfo()).resolves.toEqual(readRelayInfoValue);
      });
    },
  );

  describe.only('handles errors', () => {
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
    const readRelayInfo = jest
      .fn()
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(relayInfo);

    await expect(pollRelayInfo(500, 100, readRelayInfo)).resolves.toEqual(
      relayInfo,
    );

    expect(readRelayInfo).toHaveBeenCalledTimes(3);
  });

  /**
   * With timeout 3500ms, and interval 1000ms, pollRelayInfo can only make max. 3 poll calls.
   * We check whether polls are really called in the specified interval and not slower/faster (so exactly 3 times).
   * setInterval/Timeout/etc. are not guaranteed to call functions at __exactly__ the time specified,
   * so there is a margin of 500ms (3 x 1000ms + 500ms).
   */
  it('polls in regular intervals', async () => {
    const timeout = 3500;
    const interval = 1000;
    const readRelayInfo = jest.fn().mockReturnValue(undefined);

    await pollRelayInfo(timeout, interval, readRelayInfo).catch(() => {});

    expect(readRelayInfo).toHaveBeenCalledTimes(Math.floor(timeout / interval));
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

    const readRelayInfo = jest.fn().mockImplementation(
      () =>
        new Promise<RelayInfo>((resolve) =>
          setTimeout(() => resolve({ port: 1, pid: 1 }), pollExecTime),
        ),
    );

    await pollRelayInfo(timeout, interval, readRelayInfo).catch(() => {});

    expect(readRelayInfo).toHaveBeenCalledTimes(
      Math.floor(timeout / pollExecTime),
    );
  });

  /**
   * First poll request's execution time 2000ms exceeds the total specified 1000ms timeout.
   */
  it('rejects on timeout', async () => {
    const readRelayInfo = () =>
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 2000));

    await expect(pollRelayInfo(1000, undefined, readRelayInfo)).rejects.toBe(
      'Local Relay launch and PID file update exceeded timeout of 1000 ms',
    );
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
    jest.spyOn(util, 'readJsonFile').mockResolvedValueOnce({ main: '' });

    await expect(relayEntryPointPath()).rejects.toThrowError(
      `No 'main' path specified in ${RELAY_PKG_NAME}'s package.json`,
    );
  });
});
