import { Duplex } from 'stream';
import PULSEAdapter from './PULSEAdapter';
import { list } from './USBDebugHost';
import USBSerialDevice from './USBSerialDevice';

jest.mock('./PULSEAdapter');
jest.mock('./USBSerialDevice');

let deviceListSpy: jest.SpyInstance;
let pulseAdaptorCreateSpy: jest.SpyInstance;

interface USBHost {
  name: string;
  opened: boolean;
  connect: jest.MockedFunction<() => Promise<Duplex>>;
}

let mockDeviceA: USBHost;
let mockDeviceB: USBHost;

function mockSentinel(spy: jest.SpyInstance | jest.MockedFunction<any>) {
  const sentinel = {};
  spy.mockResolvedValueOnce(sentinel);
  return sentinel;
}

beforeEach(() => {
  deviceListSpy = jest.spyOn(USBSerialDevice, 'list');
  pulseAdaptorCreateSpy = jest.spyOn(PULSEAdapter, 'create');
  mockDeviceA = {
    name: 'Device A',
    opened: false,
    connect: jest.fn(),
  };
  mockDeviceB = {
    name: 'Device B',
    opened: true,
    connect: jest.fn(),
  };
});

it('returns a list of connected hosts', () => {
  deviceListSpy.mockResolvedValue([mockDeviceA, mockDeviceB]);
  expect(list()).resolves.toEqual([
    {
      displayName: 'Device A',
      available: true,
      connect: expect.any(Function),
      roles: ['APP_HOST'],
    },
    {
      displayName: 'Device B',
      available: false,
      connect: expect.any(Function),
      roles: ['APP_HOST'],
    },
  ]);
});

it('returns function that creates connection to host', async () => {
  deviceListSpy.mockResolvedValue([mockDeviceA]);
  const deviceStreamSentinel = mockSentinel(mockDeviceA.connect);
  const adapterSentinel = mockSentinel(pulseAdaptorCreateSpy);
  const [host] = await list();
  await expect(host.connect()).resolves.toBe(adapterSentinel);
  expect(pulseAdaptorCreateSpy).toBeCalledWith(deviceStreamSentinel);
});
