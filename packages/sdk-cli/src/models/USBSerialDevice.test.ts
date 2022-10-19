import { usb } from 'usb';
import { Duplex } from 'stream';

import USBSerialDevice from './USBSerialDevice';
import { Interface } from 'usb/dist/usb/interface';
import { EndpointDescriptor } from 'usb/dist/usb/descriptors';
import { InEndpoint, OutEndpoint } from 'usb/dist/usb/endpoint';
import { Transfer } from 'usb/dist/usb';

jest.mock('usb', () => ({
  usb: {
    getDeviceList: jest.fn(),
    LIBUSB_TRANSFER_TYPE_BULK: 2,
    LIBUSB_ENDPOINT_IN: 128,
    on: jest.fn(),
    off: jest.fn(),
  },
}));

const outEndpoint = {
  bDescriptorType: 5,
  bEndpointAddress: 3,
  bmAttributes: 2,
  wMaxPacketSize: 64,
};

const inEndpoint = {
  bDescriptorType: 5,
  bEndpointAddress: 131,
  bmAttributes: 2,
  wMaxPacketSize: 64,
};

const validEndpoints: Partial<EndpointDescriptor>[] = [inEndpoint, outEndpoint];
const testData = Buffer.from('hello world!');

let mockUSBDevices: usb.Device[] = [];
let mockDevice: jest.Mocked<usb.Device>;
let mockInterface: jest.Mocked<Interface>;
let mockInEndpoint: jest.Mocked<InEndpoint>;
let mockOutEndpoint: jest.Mocked<OutEndpoint>;

function mockTransfer(
  submitImpl?: (chunk: Buffer) => void,
): jest.Mocked<Transfer> {
  const transfer: jest.Mocked<Transfer> = {
    submit: jest.fn((chunk) => {
      if (submitImpl) submitImpl(chunk);
      return transfer;
    }),
    cancel: jest.fn(),
  };
  return transfer;
}

function makeMockDevice(
  idVendor: number,
  interfaceName: string,
  endpoints: Partial<EndpointDescriptor>[],
): jest.Mocked<usb.Device> {
  mockInEndpoint = {
    descriptor: {
      wMaxPacketSize: 64,
    },
    makeTransfer: jest.fn(),
  } as unknown as jest.Mocked<InEndpoint>;

  mockOutEndpoint = {
    descriptor: {
      wMaxPacketSize: 64,
    },
    makeTransfer: jest.fn(),
  } as unknown as jest.Mocked<OutEndpoint>;

  mockInterface = {
    claim: jest.fn(),
    endpoint: jest.fn(),
    release: jest.fn((closeAll, cb) => cb()),
    isKernelDriverActive: jest.fn(() => false),
    detachKernelDriver: jest.fn(),
  } as unknown as jest.Mocked<Interface>;

  // Order here must match call order in constructor
  mockInterface.endpoint
    .mockReturnValueOnce(mockInEndpoint)
    .mockReturnValueOnce(mockOutEndpoint);

  return {
    open: jest.fn(),
    close: jest.fn(),
    setConfiguration: jest.fn((configNum, cb) => cb()),
    deviceDescriptor: {
      idVendor,
      iProduct: 0,
    },
    allConfigDescriptors: [
      {
        bConfigurationValue: 0,
        interfaces: [
          [
            {
              endpoints,
              bInterfaceNumber: 0,
              iInterface: 1,
            },
          ],
        ],
      },
    ],
    getStringDescriptor: (
      i: number,
      cb: (ex: Error | null, val: string | undefined) => void,
    ) => {
      let val: string | undefined;
      switch (i) {
        case 0:
          val = 'A USB Device';
          break;
        case 1:
          val = interfaceName;
          break;
      }
      cb(null, val);
    },
    interface: jest.fn(() => mockInterface),
  } as unknown as jest.Mocked<usb.Device>;
}

function eventPromise<T>(stream: Duplex, eventName: string) {
  return new Promise<T>((resolve) => stream.once(eventName, resolve));
}

beforeEach(() => {
  const getDeviceListSpy = jest.spyOn(usb, 'getDeviceList');
  getDeviceListSpy.mockImplementation(() => mockUSBDevices);
  mockDevice = makeMockDevice(0x2687, 'CDC-FDB', validEndpoints);
});

it('lists suitable fitbit devices', () => {
  mockUSBDevices = [
    // Matches
    makeMockDevice(0x2687, 'CDC-FDB', validEndpoints),
    // Missing out endpoint
    makeMockDevice(0x2687, 'CDC-FDB', [inEndpoint]),
    // Missing in endpoint
    makeMockDevice(0x2687, 'CDC-FDB', [outEndpoint]),
    // Wrong vendor ID
    makeMockDevice(0x1337, 'CDC-FDB', validEndpoints),
    // Wrong interface name
    makeMockDevice(0x2687, 'CDC-FOO', validEndpoints),
  ];
  expect(USBSerialDevice.list()).resolves.toEqual([
    {
      name: 'A USB Device',
      opened: false,
      connect: expect.any(Function),
    },
  ]);
});

it('throws if reading a string descriptor fails when listing devices', () => {
  jest
    .spyOn(mockDevice, 'getStringDescriptor')
    .mockImplementationOnce((i, cb) => {
      cb(new Error('string descriptor read failed!') as any);
    });
  mockUSBDevices = [mockDevice];
  return expect(USBSerialDevice.list()).rejects.toThrowError(
    'string descriptor read failed!',
  );
});

it('connects to a device (config correct)', async () => {
  mockUSBDevices = [
    {
      ...mockDevice,
      configDescriptor: { bConfigurationValue: 0 },
    } as unknown as usb.Device,
  ];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();
  expect(stream).toBeInstanceOf(Duplex);
  expect(mockDevice.open).toBeCalled();
  expect(mockDevice.setConfiguration).not.toBeCalled();
  expect(mockInterface.claim).toBeCalled();
  stream.destroy();
});

it('connects to a device (config change required)', async () => {
  mockUSBDevices = [
    {
      ...mockDevice,
      configDescriptor: { bConfigurationValue: 1 },
    } as unknown as usb.Device,
  ];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();
  expect(stream).toBeInstanceOf(Duplex);
  expect(mockDevice.open).toBeCalledWith(false);
  expect(mockDevice.setConfiguration).toBeCalled();
  expect(mockInterface.claim).toBeCalled();
  stream.destroy();
});

it('detaches kernel driver if needed', async () => {
  mockUSBDevices = [mockDevice];
  mockInterface.isKernelDriverActive.mockReturnValueOnce(true);
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();
  expect(stream).toBeInstanceOf(Duplex);
  expect(mockDevice.open).toBeCalledWith(false);
  expect(mockDevice.setConfiguration).toBeCalled();
  expect(mockInterface.detachKernelDriver).toBeCalled();
  expect(mockInterface.claim).toBeCalled();
  stream.destroy();
});

it('closes device once stream is closed', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();
  stream.destroy();

  // cleanup is async, wait for it...
  await new Promise((resolve) => setImmediate(resolve));

  expect(mockDevice.close).toBeCalled();
});

it('closes device again if setup fails', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  mockInterface.claim.mockImplementation(() => {
    throw new Error('fail to claim');
  });
  await expect(fitbitDevice.connect()).rejects.toThrowError();
  expect(mockDevice.close).toBeCalled();
});

it('emits an error if cleanup fails', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  mockDevice.close.mockImplementation(() => {
    throw new Error('fail to close');
  });

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

  let writeTransfer: jest.Mocked<Transfer>;
  mockOutEndpoint.makeTransfer.mockImplementationOnce((timeout, cb) => {
    writeTransfer = mockTransfer((chunk) =>
      cb!(undefined, chunk, chunk.byteLength),
    );
    return writeTransfer;
  });

  stream.write(testData);
  stream.destroy();

  await eventPromise(stream, 'close');

  expect(writeTransfer!.submit).toBeCalledWith(testData);
});

it('emits error when writing bytes to device fails', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();

  mockOutEndpoint.makeTransfer.mockImplementationOnce((timeout, cb) => {
    return mockTransfer((chunk) => cb!(undefined, chunk, chunk.byteLength - 1));
  });

  stream.write(testData);

  await expect(eventPromise(stream, 'error')).resolves.toThrowError(
    'USB write failed: wrote 11 of 12 bytes',
  );
});

it('emits error when writing bytes to device fails', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();

  mockOutEndpoint.makeTransfer.mockImplementationOnce((timeout, cb) => {
    return mockTransfer((chunk) =>
      cb!(new Error('write failed!') as any, chunk, 0),
    );
  });

  stream.write(testData);

  await expect(eventPromise(stream, 'error')).resolves.toThrowError(
    'USB write failed: Error: write failed!',
  );
});

it('reads bytes from device', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();

  mockInEndpoint.makeTransfer.mockImplementationOnce((timeout, cb) =>
    mockTransfer((chunk) => {
      testData.copy(chunk);
      cb!(undefined, chunk, testData.byteLength);
    }),
  );

  // Make sure we return never ending transfers for subsequent reads
  mockInEndpoint.makeTransfer.mockImplementation((timeout, cb) =>
    mockTransfer(),
  );

  stream.resume();

  return new Promise<void>((resolve) =>
    stream.on('data', (chunk) => {
      expect(chunk).toEqual(testData);
      stream.destroy();
      resolve();
    }),
  );
});

it('emits error when reading bytes from device throws', async () => {
  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();

  mockInEndpoint.makeTransfer.mockImplementationOnce((timeout, cb) =>
    mockTransfer((chunk) => {
      testData.copy(chunk);
      cb!(new Error('read failed!') as any, chunk, 0);
    }),
  );

  // Make sure we return never ending transfers for subsequent reads
  mockInEndpoint.makeTransfer.mockImplementation((timeout, cb) =>
    mockTransfer(),
  );

  stream.resume();

  await expect(eventPromise(stream, 'error')).resolves.toThrowError(
    'USB read failed: Error: read failed!',
  );
});

it('destroys stream on device detach', async () => {
  let callback: (device: usb.Device) => void;
  jest.spyOn(usb, 'on').mockImplementationOnce((eventName, cb) => {
    if (eventName === 'detach') callback = cb;
  });

  mockUSBDevices = [mockDevice];
  const [fitbitDevice] = await USBSerialDevice.list();
  const stream = await fitbitDevice.connect();

  const streamDestroySpy = jest.spyOn(stream, 'destroy');
  expect(streamDestroySpy).not.toBeCalled();
  callback!({} as any);
  expect(streamDestroySpy).not.toBeCalled();
  callback!(mockDevice);
  expect(streamDestroySpy).toBeCalled();
});
