import stream from 'stream';

import { RemoteHost } from '@fitbit/fdb-debugger';

import * as developerRelay from '../api/developerRelay';
import HostConnections, { Host } from '../models/HostConnections';
import { DeviceType, HostType } from '../models//HostTypes';
import * as USBDebugHost from './USBDebugHost';

jest.mock('@fitbit/fdb-debugger');

const hostConnectedSpy = jest.fn();

let hostConnections: HostConnections;
let remoteHostSpy: jest.SpyInstance;
let mockHost: Host;
let mockStream: jest.Mocked<stream.Duplex>;
let mockRemoteHost: {};
let developerRelaySpy: jest.SpyInstance;
let usbSpy: jest.SpyInstance;

const relayHost = {
  displayName: 'RelayHost',
  connect: jest.fn(),
  available: true,
  roles: ['COMPANION_HOST'],
};

const usbHost = {
  displayName: 'USBHost',
  connect: jest.fn(),
  available: true,
  roles: ['APP_HOST'],
};

function mockSentinel(spy: jest.SpyInstance | jest.MockedFunction<any>) {
  const sentinel = {};
  spy.mockResolvedValueOnce(sentinel);
  return sentinel;
}

beforeEach(() => {
  hostConnections = new HostConnections();
  hostConnections.onHostAdded.attach(hostConnectedSpy);
  remoteHostSpy = jest.spyOn(RemoteHost, 'connect');
  mockHost = {
    displayName: 'Mock Host',
    available: true,
    connect: jest.fn(),
    roles: ['APP_HOST'],
  };
  developerRelaySpy = jest.spyOn(developerRelay, 'hosts');
  usbSpy = jest.spyOn(USBDebugHost, 'list');
  mockStream = mockSentinel(mockHost.connect) as jest.Mocked<stream.Duplex>;
  mockStream.destroy = jest.fn();
});

describe('connect()', () => {
  describe.each<DeviceType>(['device', 'phone'])(
    'when the device type argument is %s',
    (deviceType) => {
      const hostTypes: { [key in DeviceType]: HostType } = {
        device: 'appHost',
        phone: 'companionHost',
      };
      const hostType = hostTypes[deviceType];

      beforeEach(() => {
        mockRemoteHost = mockSentinel(remoteHostSpy);
        return hostConnections.connect(mockHost, deviceType);
      });

      it('acquires a connection from the provided host', () => {
        expect(mockHost.connect).toBeCalledWith();
      });

      it('creates a debugger client from the developer relay connection', () => {
        expect(remoteHostSpy).toBeCalledWith(mockStream, undefined);
      });

      it('stores the connection in the application state', () => {
        expect(hostConnections[hostType]!.stream).toBe(mockStream);
        expect(hostConnections[hostType]!.host).toBe(mockRemoteHost);
      });

      it('emits a host-connected event with the HostType and HostConnection', () => {
        expect(hostConnectedSpy).toBeCalledWith({
          hostType,
          host: mockRemoteHost,
        });
      });

      it('closes any existing connection', async () => {
        mockSentinel(mockHost.connect);
        mockSentinel(remoteHostSpy);
        await hostConnections.connect(mockHost, deviceType);
        expect(mockStream.destroy).toBeCalled();
      });
    },
  );

  it('closes the underlying transport if devbridge initialisation fails', async () => {
    remoteHostSpy.mockRejectedValueOnce(new Error('init failed :('));
    await expect(
      hostConnections.connect(mockHost, 'device'),
    ).rejects.toThrowError();
    expect(mockStream.destroy).toBeCalled();
  });
});

describe('listOfType()', () => {
  it('returns only app hosts', () => {
    developerRelaySpy.mockResolvedValue([relayHost]);
    usbSpy.mockResolvedValue([usbHost]);
    return expect(hostConnections.listOfType('device')).resolves.toEqual([
      usbHost,
    ]);
  });

  it('returns only companion hosts', () => {
    developerRelaySpy.mockResolvedValue([relayHost]);
    usbSpy.mockResolvedValue([usbHost]);
    return expect(hostConnections.listOfType('phone')).resolves.toEqual([
      relayHost,
    ]);
  });

  it('throws if fetching USB hosts fails', () => {
    developerRelaySpy.mockResolvedValue([relayHost]);
    usbSpy.mockRejectedValue(new Error('fail usb'));
    return expect(hostConnections.listOfType('device')).rejects.toThrowError(
      'An error was encountered when loading the list of available USB hosts: fail usb',
    );
  });

  it('throws if fetching developer relay hosts fails', () => {
    developerRelaySpy.mockRejectedValue(new Error('fail devrelay'));
    return expect(hostConnections.listOfType('phone')).rejects.toThrowError(
      'An error was encountered when loading the list of available Developer Relay hosts: fail devrelay',
    );
  });
});
