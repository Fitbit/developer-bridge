import { readRelayInfo } from './relayInfo';
import * as util from './util';

it('throws if no relay temp file name is defined', async () => {
  await expect(readRelayInfo(null as any)).rejects.toMatchObject({
    message: 'No temp directory or file name configured',
  });
});

describe.each([
  {
    port: 5,
    pid: 7,
    isValidPort: true,
    isValidPid: true,
    readJsonFileValue: { port: 5, pid: 7 },
    readRelayInfoValue: { port: 5, pid: 7 },
  },
  {
    port: 5,
    pid: '7',
    isValidPort: true,
    isValidPid: false,
    readJsonFileValue: { port: 5, pid: '7' },
    readRelayInfoValue: false,
  },
  {
    port: '5',
    pid: 7,
    isValidPort: false,
    isValidPid: true,
    readJsonFileValue: { port: '5', pid: 7 },
    readRelayInfoValue: false,
  },
  {
    port: '5',
    pid: 7,
    isValidPort: false,
    isValidPid: true,
    readJsonFileValue: false as const,
    readRelayInfoValue: undefined,
  },
  {
    port: '5',
    pid: 7,
    isValidPort: false,
    isValidPid: true,
    readJsonFileValue: {},
    readRelayInfoValue: false,
  },
])(
  'reads',
  ({
    port,
    pid,
    isValidPort,
    isValidPid,
    readJsonFileValue,
    readRelayInfoValue,
  }) => {
    const [resultName, conditionName] =
      readJsonFileValue === false
        ? ['undefined', 'readJsonFile indicates error (return: false)']
        : Object.keys(readJsonFileValue).length === 0
        ? ['false', 'no relay info has been obtained']
        : isValidPort && isValidPid
        ? ['relay info (port, pid)', 'both are valid numbers']
        : isValidPort
        ? ['false', 'port is not a number']
        : ['false', 'pid is not a number'];

    it(`returns ${resultName} if ${conditionName}`, async () => {
      expect(util.isInt(port)).toBe(isValidPort);
      expect(util.isInt(pid)).toBe(isValidPid);

      jest.spyOn(util, 'readJsonFile').mockResolvedValueOnce(readJsonFileValue);

      await expect(readRelayInfo()).resolves.toEqual(readRelayInfoValue);
    });
  },
);
