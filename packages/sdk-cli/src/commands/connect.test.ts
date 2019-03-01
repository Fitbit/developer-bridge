import events from 'events';

import vorpal from 'vorpal';

import connect, { DeviceType } from './connect';
import commandTestHarness from '../testUtils/commandTestHarness';
import * as developerRelay from '../api/developerRelay';
import HostConnections, { HostType } from '../models/HostConnections';

jest.mock('../models/HostConnections');

const mockAppHost: developerRelay.Host = {
  id: 'apphost',
  displayName: 'App Host',
  roles: ['APP_HOST'],
  state: 'available',
};

const mockAppHost2: developerRelay.Host = {
  id: 'apphost2',
  displayName: 'Another App Host',
  roles: ['APP_HOST'],
  state: 'available',
};

const mockCompanionHost: developerRelay.Host = {
  id: 'companionhost',
  displayName: 'Companion Host',
  roles: ['COMPANION_HOST'],
  state: 'available',
};

const mockCompanionHost2: developerRelay.Host = {
  id: 'companionhost2',
  displayName: 'Another Companion Host',
  roles: ['COMPANION_HOST'],
  state: 'available',
};

const mockBusyAppHost: developerRelay.Host = {
  id: 'apphost3',
  displayName: 'Yet Another App Host',
  roles: ['APP_HOST'],
  state: 'busy',
};

const mockRelayHosts = {
  device: [mockAppHost, mockAppHost2],
  phone: [mockCompanionHost, mockCompanionHost2],
};

let cli: vorpal;
let mockLog: jest.Mock;
let mockPrompt: jest.Mock;
let mockWS: events.EventEmitter;

let hostConnections: HostConnections;
let relayHostsSpy: jest.SpyInstance;
let hostConnectSpy: jest.SpyInstance;

const mockRelayHostsResponse = {
  device: (hosts: developerRelay.Host[]) =>
    relayHostsSpy.mockResolvedValueOnce({ appHost: hosts, companionHost: [] }),
  phone: (hosts: developerRelay.Host[]) =>
  relayHostsSpy.mockResolvedValueOnce({ appHost: [], companionHost: hosts }),
};

beforeEach(() => {
  hostConnections = new HostConnections();
  ({ cli, mockLog, mockPrompt } = commandTestHarness(connect({ hostConnections })));
  relayHostsSpy = jest.spyOn(developerRelay, 'hosts');
  hostConnectSpy = jest.spyOn(hostConnections, 'connect');
  mockWS = new events.EventEmitter();
  hostConnectSpy.mockResolvedValueOnce({ ws: mockWS });
});

function doConnect(type: DeviceType) {
  return cli.exec(`connect ${type}`);
}

describe.each([
  ['device', 'appHost'],
  ['phone', 'companionHost'],
])(
  'when the device type argument is %s',
  (deviceType: DeviceType, hostType: HostType) => {
    it(`logs an error if no ${deviceType}s are connected`, async () => {
      mockRelayHostsResponse[deviceType]([]);
      await doConnect(deviceType);
      expect(mockLog.mock.calls[0]).toMatchSnapshot();
    });

    describe(`when a single ${deviceType} is connected`, () => {
      let mockHost: developerRelay.Host;

      beforeEach(() => {
        mockHost = mockRelayHosts[deviceType][0];
        mockRelayHostsResponse[deviceType]([mockHost]);
        return doConnect(deviceType);
      });

      it('does not prompt the user to select a host', () => {
        expect(mockPrompt).not.toBeCalled();
      });

      it('logs a message explaining the auto-connection', () => {
        expect(mockLog.mock.calls[0]).toMatchSnapshot();
      });

      it('acquires a developer relay connection for the given host type and ID', () => {
        expect(hostConnectSpy).toBeCalledWith(hostType, mockHost.id);
      });

      it('logs a message when the host disconnects', () => {
        mockWS.emit('finish');
        expect(mockLog.mock.calls[1]).toMatchSnapshot();
      });
    });

    describe(`when multiple ${deviceType}s are connected`, () => {
      let mockSelectedHost: developerRelay.Host;

      beforeEach(() => {
        const mockHosts = mockRelayHosts[deviceType];
        mockSelectedHost = mockHosts[1];
        mockRelayHostsResponse[deviceType](mockHosts);
        mockPrompt.mockResolvedValueOnce({
          hostID: {
            id: mockSelectedHost.id,
            displayName: mockSelectedHost.displayName,
          },
        });
        return doConnect(deviceType);
      });

      it('prompts the user to select a host', () => {
        expect(mockPrompt).toBeCalled();
      });

      it('acquires a developer relay connection for the given host type and ID', () => {
        expect(hostConnectSpy).toBeCalledWith(hostType, mockSelectedHost.id);
      });
    });

    it('logs an error if the hosts call throws', async () => {
      relayHostsSpy.mockRejectedValueOnce(new Error('some error'));
      await doConnect(deviceType);
      expect(mockLog.mock.calls[0]).toMatchSnapshot();
    });
  },
);

it('does not show busy hosts', async () => {
  mockRelayHostsResponse.device([
    mockAppHost,
    mockAppHost2,
    mockBusyAppHost,
  ]);

  mockPrompt.mockResolvedValueOnce({
    hostID: {
      id: mockAppHost.id,
      displayName: mockAppHost.displayName,
    },
  });

  await doConnect('device');
  expect(mockPrompt).toBeCalledWith(expect.objectContaining({
    choices: [mockAppHost, mockAppHost2].map(host => ({
      value: { id: host.id, displayName: host.displayName },
      name: host.displayName,
    })),
  }));
});

it('does not auto-connect a busy host', async () => {
  mockRelayHostsResponse.device([mockBusyAppHost]);
  await doConnect('device');
  expect(mockLog.mock.calls[0]).toMatchSnapshot();
});
