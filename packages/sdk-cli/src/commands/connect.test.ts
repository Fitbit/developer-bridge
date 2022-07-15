import events from 'events';

import vorpal from '@moleculer/vorpal';

import connect from './connect';
import commandTestHarness from '../testUtils/commandTestHarness';
import HostConnections, { Host } from '../models/HostConnections';
import { DeviceType, HostType } from '../models/HostTypes';

jest.mock('../models/HostConnections');

const mockAppHost: Host = {
  connect: jest.fn(),
  displayName: 'App Host',
  roles: ['APP_HOST'],
  available: true,
};

const mockAppHost2: Host = {
  connect: jest.fn(),
  displayName: 'Another App Host',
  roles: ['APP_HOST'],
  available: true,
};

const mockCompanionHost: Host = {
  connect: jest.fn(),
  displayName: 'Companion Host',
  roles: ['COMPANION_HOST'],
  available: true,
};

const mockCompanionHost2: Host = {
  connect: jest.fn(),
  displayName: 'Another Companion Host',
  roles: ['COMPANION_HOST'],
  available: true,
};

const mockBusyAppHost: Host = {
  connect: jest.fn(),
  displayName: 'Yet Another App Host',
  roles: ['APP_HOST'],
  available: false,
};

const mockRelayHosts: { [key in DeviceType]: Host[] } = {
  device: [mockAppHost, mockAppHost2],
  phone: [mockCompanionHost, mockCompanionHost2],
};

let cli: vorpal;
let mockLog: jest.Mock;
let mockPrompt: jest.Mock;
let mockStream: events.EventEmitter;

let hostConnections: HostConnections;
let listOfTypeSpy: jest.SpyInstance;
let hostConnectSpy: jest.SpyInstance;

beforeEach(() => {
  hostConnections = new HostConnections();
  ({ cli, mockLog, mockPrompt } = commandTestHarness(
    connect({ hostConnections }),
  ));
  listOfTypeSpy = jest.spyOn(hostConnections, 'listOfType');
  hostConnectSpy = jest.spyOn(hostConnections, 'connect');
  mockStream = new events.EventEmitter();
  hostConnectSpy.mockResolvedValueOnce({ stream: mockStream });
});

function doConnect(type: DeviceType) {
  return cli.exec(`connect ${type}`);
}

describe.each<[DeviceType, HostType]>([
  ['device', 'appHost'],
  ['phone', 'companionHost'],
])('when the device type argument is %s', (deviceType, hostType) => {
  it(`logs an error if no ${deviceType}s are connected`, async () => {
    listOfTypeSpy.mockResolvedValueOnce([]);
    await doConnect(deviceType);
    expect(mockLog.mock.calls[0]).toMatchSnapshot();
  });

  describe(`when a single ${deviceType} is connected`, () => {
    let mockHost: Host;

    beforeEach(() => {
      mockHost = mockRelayHosts[deviceType][0];
      listOfTypeSpy.mockResolvedValueOnce([mockHost]);
      return doConnect(deviceType);
    });

    it('does not prompt the user to select a host', () => {
      expect(mockPrompt).not.toBeCalled();
    });

    it('logs a message explaining the auto-connection', () => {
      expect(mockLog.mock.calls[0]).toMatchSnapshot();
    });

    it('acquires a connection for the selected host', () => {
      expect(hostConnectSpy).toBeCalledWith(mockHost, deviceType);
    });

    it('logs a message when the host disconnects', () => {
      mockStream.emit('finish');
      expect(mockLog.mock.calls[1]).toMatchSnapshot();
    });
  });

  describe(`when multiple ${deviceType}s are connected`, () => {
    let mockSelectedHost: Host;

    beforeEach(() => {
      const mockHosts = mockRelayHosts[deviceType];
      mockSelectedHost = mockHosts[1];
      listOfTypeSpy.mockResolvedValueOnce(mockHosts);
      mockPrompt.mockResolvedValueOnce({
        host: mockSelectedHost,
      });
      return doConnect(deviceType);
    });

    it('prompts the user to select a host', () => {
      expect(mockPrompt).toBeCalled();
    });

    it('acquires a connection for the selected host', () => {
      expect(hostConnectSpy).toBeCalledWith(mockSelectedHost, deviceType);
    });
  });

  it('logs an error if the hosts call throws', async () => {
    listOfTypeSpy.mockRejectedValueOnce(new Error('some error'));
    await doConnect(deviceType);
    expect(mockLog.mock.calls[0]).toMatchSnapshot();
  });
});

it('does not show busy hosts', async () => {
  listOfTypeSpy.mockResolvedValueOnce([
    mockAppHost,
    mockAppHost2,
    mockBusyAppHost,
  ]);

  mockPrompt.mockResolvedValueOnce({
    host: mockAppHost,
  });

  await doConnect('device');
  expect(mockPrompt).toBeCalledWith(
    expect.objectContaining({
      choices: [mockAppHost, mockAppHost2].map((host) => ({
        value: host,
        name: host.displayName,
      })),
    }),
  );
});

it('does not auto-connect a busy host', async () => {
  listOfTypeSpy.mockResolvedValueOnce([mockBusyAppHost]);
  await doConnect('device');
  expect(mockLog.mock.calls[0]).toMatchSnapshot();
});
