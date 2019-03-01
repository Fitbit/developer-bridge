import stream from 'stream';

import { RemoteHost } from '@fitbit/fdb-debugger';

import * as developerRelay from '../api/developerRelay';
import HostConnections, { HostType } from '../models/HostConnections';

jest.mock('@fitbit/fdb-debugger');

const mockHostID = 'mockHostID';
const hostConnectedSpy = jest.fn();

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
  relayConnectSpy = jest.spyOn(developerRelay, 'connect');
  remoteHostSpy = jest.spyOn(RemoteHost, 'connect');
});

function doConnect(type: HostType) {
  return hostConnections.connect(type, mockHostID);
}

describe.each([
  'appHost',
  'companionHost',
])(
  'when the host type argument is %s', (hostType: HostType) => {
    let mockWS: jest.Mocked<stream.Duplex>;
    let mockRemoteHost: {};

    beforeEach(() => {
      mockWS = mockSentinel(relayConnectSpy) as jest.Mocked<stream.Duplex>;
      mockWS.destroy = jest.fn();

      mockRemoteHost = mockSentinel(remoteHostSpy);
      return doConnect(hostType);
    });

    it('acquires a developer relay connection for the given host ID', () => {
      expect(relayConnectSpy).toBeCalledWith(mockHostID);
    });

    it('creates a debugger client from the developer relay connection', () => {
      expect(remoteHostSpy).toBeCalledWith(mockWS);
    });

    it('stores the connection in the application state', () => {
      expect(hostConnections[hostType]!.ws).toBe(mockWS);
      expect(hostConnections[hostType]!.host).toBe(mockRemoteHost);
    });

    it('emits a host-connected event with the HostType and HostConnection', () => {
      expect(hostConnectedSpy).toBeCalledWith({ hostType, host: mockRemoteHost });
    });

    it('closes any existing connection', async () => {
      mockSentinel(relayConnectSpy);
      mockSentinel(remoteHostSpy);
      await doConnect(hostType);
      expect(mockWS.destroy).toBeCalled();
    });
  },
);
