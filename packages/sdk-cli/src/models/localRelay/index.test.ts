import { instance } from '.';
import * as relayInfoUtils from './relayInfo';
import * as launchUtils from './launch';

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

  describe('launches relay instance if no existing relay instance', () => {
    it('polls and returns launched relay instance info', async () => {
      const relayInfo = { port: 1, pid: 1 };
      (relayInfoUtils.readRelayInfo as jest.Mock).mockResolvedValueOnce(false);
      (relayInfoUtils.pollRelayInfo as jest.Mock).mockResolvedValueOnce(
        relayInfo,
      );

      await expect(instance()).resolves.toEqual(relayInfo);
      expect(launchUtils.launch).toHaveBeenCalled();
    });

    it('throws if no launched relay instance info obtained', async () => {
      (relayInfoUtils.readRelayInfo as jest.Mock).mockResolvedValueOnce(false);
      (relayInfoUtils.pollRelayInfo as jest.Mock).mockResolvedValueOnce(false);

      await expect(instance()).rejects.toThrow(
        "Couldn't obtain Local Relay port and pid from PID file",
      );
      expect(launchUtils.launch).toHaveBeenCalled();
    });
  });
});
