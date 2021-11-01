import { Duplex } from 'stream';

import { RemoteHost } from '@fitbit/fdb-debugger';

import DeveloperRelay from '../models/DeveloperRelay';
import HostConnections, { HostType } from '../models/HostConnections';

jest.mock('@fitbit/fdb-debugger');

const mockHostID = 'mockHostID';
const hostConnectedSpy = jest.fn();
const relayInstance = new DeveloperRelay();

let hostConnections: HostConnections;
let relayConnectSpy: jest.SpyInstance;
let remoteHostSpy: jest.SpyInstance;

function mockSentinel(spy: jest.SpyInstance) {
  const sentinel = {};
  spy.mockResolvedValueOnce(sentinel);
  return sentinel;
}

beforeEach(() => {
  hostConnections = new HostConnections();
  hostConnections.onHostAdded.attach(hostConnectedSpy);
  relayConnectSpy = jest.spyOn(DeveloperRelay.prototype, 'connect');
  remoteHostSpy = jest.spyOn(RemoteHost, 'connect');
});

async function doConnect(type: HostType) {
  jest.spyOn(relayInstance, 'connect').mockResolvedValueOnce(new Duplex());
  const ws = await relayInstance.connect(mockHostID);
  return hostConnections.connect(type, ws);
}

describe.each<HostType>(['appHost', 'companionHost'])(
  'when the host type argument is %s',
  (hostType) => {
    let mockWS: jest.Mocked<Duplex>;
    let mockRemoteHost: {};

    beforeEach(() => {
      mockWS = mockSentinel(relayConnectSpy) as jest.Mocked<Duplex>;
      mockWS.destroy = jest.fn();

      mockRemoteHost = mockSentinel(remoteHostSpy);
      return doConnect(hostType);
    });

    it('acquires a developer relay connection for the given host ID', () => {
      expect(relayConnectSpy).toBeCalledWith(mockHostID);
    });

    it('creates a debugger client from the developer relay connection', () => {
      expect(remoteHostSpy).toBeCalledWith(mockWS, undefined);
    });

    it('stores the connection in the application state', () => {
      expect(hostConnections[hostType]!.ws).toBe(mockWS);
      expect(hostConnections[hostType]!.host).toBe(mockRemoteHost);
    });

    it('emits a host-connected event with the HostType and HostConnection', () => {
      expect(hostConnectedSpy).toBeCalledWith({
        hostType,
        host: mockRemoteHost,
      });
    });

    it('closes any existing connection', async () => {
      mockSentinel(relayConnectSpy);
      mockSentinel(remoteHostSpy);
      await doConnect(hostType);
      expect(mockWS.destroy).toBeCalled();
    });
  },
);
