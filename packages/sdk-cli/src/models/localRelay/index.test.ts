import { instance } from '.';
import * as relayInfoUtils from './relayInfo';
import * as launchUtils from './launch';
import { RELAY_PKG_NAME } from './const';

jest.mock('fs');
jest.mock('./relayInfo');
jest.mock('./launch');

describe('instance', () => {
  it('returns relay info of existing relay instance', async () => {
    const relayInfo = { port: 1, pid: 1 };
    (relayInfoUtils.readRelayInfo as jest.Mock).mockResolvedValueOnce(
      relayInfo,
    );

    await expect(instance()).resolves.toEqual(relayInfo);
  });

  it('throws if local relay pkg not installed', async () => {
    jest
      .spyOn(relayInfoUtils, 'isRelayPkgInstalled')
      .mockResolvedValueOnce(false);

    await expect(instance()).rejects.toThrow(
      `To launch local relay (-l, --local flag), you should have ${RELAY_PKG_NAME} installed. No ${RELAY_PKG_NAME} dependency found in package.json`,
    );
  });

  describe('launches relay instance if no existing relay instance', () => {
    beforeEach(() => {
      jest
        .spyOn(relayInfoUtils, 'isRelayPkgInstalled')
        .mockResolvedValueOnce(true);
    });

    it('polls and returns launched relay instance info', async () => {
      const relayInfo = { port: 1, pid: 1 };
      (relayInfoUtils.readRelayInfo as jest.Mock).mockResolvedValueOnce(false);
      (relayInfoUtils.pollRelayInfo as jest.Mock).mockResolvedValueOnce(
        relayInfo,
      );

      await expect(instance()).resolves.toEqual(relayInfo);
      // launch() is an empty mock
      expect(launchUtils.launch).toHaveBeenCalled();
    });

    it('throws if no launched relay instance info obtained', async () => {
      (relayInfoUtils.readRelayInfo as jest.Mock).mockResolvedValueOnce(false);
      (relayInfoUtils.pollRelayInfo as jest.Mock).mockResolvedValueOnce(false);

      await expect(instance()).rejects.toThrow(
        "Couldn't obtain Local Relay port and pid from PID file",
      );

      // launch() is an empty mock
      expect(launchUtils.launch).toHaveBeenCalled();
    });
  });
});
