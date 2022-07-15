import * as usb from 'usb';
import { Duplex } from 'stream';

import USBSerialDevice from './USBSerialDevice';

jest.mock('usb', () => ({
  WebUSB: jest.fn(),
}));

const validEndpoints: USBEndpoint[] = [
  { direction: 'in', type: 'bulk', endpointNumber: 0, packetSize: 64 },
  { direction: 'out', type: 'bulk', endpointNumber: 0, packetSize: 64 },
];
const testData = Buffer.from('hello world!');

let mockUSBDevices: USBDevice[] = [];
let mockDevice: jest.Mocked<USBDevice>;

function makeMockDevice(
  vendorId: number,
  interfaceName: string,
  endpoints: USBEndpoint[],
  opened: boolean,
): jest.Mocked<USBDevice> {
  return {
    vendorId,
    opened,
    reset: jest.fn(),
    open: jest.fn(),
    close: jest.fn(),
    selectConfiguration: jest.fn(),
    claimInterface: jest.fn(),
    transferIn: jest.fn(),
    transferOut: jest.fn(),
    productName: 'A USB Device',
    manufacturerName: 'Fitbit',
    configurations: [
      {
        interfaces: [
          {
            alternates: [
              {
                interfaceName,
                endpoints,
              },
            ],
            interfaceNumber: 0,
          },
        ],
        configurationValue: 0,
      },
    ],
  } as unknown as jest.Mocked<USBDevice>;
}

function eventPromise<T>(stream: Duplex, eventName: string) {
  return new Promise<T>((resolve) => stream.once(eventName, resolve));
}

beforeEach(() => {
  const webUSBSpy = jest.spyOn(usb, 'WebUSB');
  webUSBSpy.mockReturnValue({
    getDevices: jest.fn(() => Promise.resolve(mockUSBDevices)),
  } as unknown as usb.WebUSB);
  mockDevice = makeMockDevice(0x2687, 'CDC-FDB', validEndpoints, false);
});

it('lists suitable fitbit devices', () => {
  mockUSBDevices = [
    // Matches
    makeMockDevice(0x2687, 'CDC-FDB', validEndpoints, false),
    // Missing out endpoint
    makeMockDevice(
      0x2687,
      'CDC-FDB',
      [{ direction: 'in', type: 'bulk', endpointNumber: 0, packetSize: 64 }],
      false,
    ),
    // Missing in endpoint
    makeMockDevice(
      0x2687,
      'CDC-FDB',
      [{ direction: 'out', type: 'bulk', endpointNumber: 0, packetSize: 64 }],
      false,
    ),
    // Wrong vendor ID
    makeMockDevice(0x1337, 'CDC-FDB', validEndpoints, false),
    // Wrong interface name
    makeMockDevice(0x2687, 'CDC-FOO', validEndpoints, false),
  ];
  expect(USBSerialDevice.list()).resolves.toEqual([
    {
      name: 'A USB Device',
      opened: false,
      connect: expect.any(Function),
    },
  ]);
});

it('connects to a device', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();
  expect(stream).toBeInstanceOf(Duplex);
  expect(mockDevice.open).toBeCalled();
  expect(mockDevice.claimInterface).toBeCalled();
  expect(mockDevice.selectConfiguration).toBeCalled();
  stream.destroy();
});

it('closes device once stream is closed', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();
  stream.destroy();

  // cleanup is async, wait for it...
  await new Promise((resolve) => setImmediate(resolve));

  expect(mockDevice.reset).toBeCalled();
  expect(mockDevice.close).toBeCalled();
});

it('closes device again if setup fails', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  mockDevice.claimInterface.mockRejectedValueOnce(new Error('fail to claim'));
  await expect(fitbitDevice.connect()).rejects.toThrowError();
  expect(mockDevice.close).toBeCalled();
});

it('emits an error if cleanup fails', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  mockDevice.close.mockRejectedValueOnce(new Error('fail to close'));

  const stream = await fitbitDevice.connect();
  stream.destroy();
  await expect(eventPromise(stream, 'error')).resolves.toThrowError(
    'Failed to close USB device: Error: fail to close',
  );
});

it('writes bytes to device', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();

  mockDevice.transferIn.mockImplementationOnce(() => new Promise(() => {}));
  mockDevice.transferOut.mockResolvedValueOnce({
    status: 'ok',
    bytesWritten: testData.length,
  });

  stream.write(testData);
  stream.destroy();

  await eventPromise(stream, 'close');

  expect(mockDevice.transferOut).toBeCalledWith(expect.any(Number), testData);
});

it('emits error when writing bytes to device fails', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();

  mockDevice.transferIn.mockImplementationOnce(() => new Promise(() => {}));
  mockDevice.transferOut.mockResolvedValueOnce({
    status: 'stall',
    bytesWritten: 0,
  });

  stream.write(testData);

  await expect(eventPromise(stream, 'error')).resolves.toThrowError(
    'USB write failed: stall, wrote 0 of 12 bytes',
  );
});

it('emits error when writing bytes to device fails', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();

  mockDevice.transferIn.mockImplementationOnce(() => new Promise(() => {}));
  mockDevice.transferOut.mockRejectedValueOnce(new Error('failed write'));

  stream.write(testData);

  await expect(eventPromise(stream, 'error')).resolves.toThrowError(
    'USB write failed: Error: failed write',
  );
});

it('reads bytes from device', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();

  mockDevice.transferIn
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolve({
            status: 'ok',
            data: new DataView(
              testData.buffer,
              testData.byteOffset,
              testData.byteLength,
            ),
          });
        }),
    )
    .mockImplementation(() => new Promise(() => {}));

  return new Promise<void>((resolve) =>
    stream.on('data', (chunk) => {
      expect(chunk).toEqual(testData);
      stream.destroy();
      resolve();
    }),
  );
});

it('emits error when reading bytes from device fails', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();

  mockDevice.transferIn.mockResolvedValueOnce({ status: 'stall' });
  stream.resume();

  await expect(eventPromise(stream, 'error')).resolves.toThrowError(
    'USB read failed: stall',
  );
});

it('emits error when reading bytes from device throws', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();

  mockDevice.transferIn.mockRejectedValueOnce(new Error(`failed read`));
  stream.resume();

  await expect(eventPromise(stream, 'error')).resolves.toThrowError(
    'USB read failed: Error: failed read',
  );
});
