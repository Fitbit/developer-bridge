import { usb } from 'usb';
import { EndpointDescriptor } from 'usb/dist/usb/descriptors';
import { Interface } from 'usb/dist/usb/interface';
import { Duplex } from 'stream';
import { promisify } from 'util';
import { InEndpoint, OutEndpoint } from 'usb/dist/usb/endpoint';
import { Transfer } from 'usb/dist/usb';

const FITBIT_VENDOR_ID = 0x2687;
const FITBIT_FDB_INTERFACE_NAME = 'CDC-FDB';

// Track which devices are open to prevent duplicate connections
const openedDevices: Set<usb.Device> = new Set();

function findEndpoint(
  endpoints: EndpointDescriptor[],
  direction: USBDirection,
): number | undefined {
  const epTypeMask = 0x03;

  for (const endpoint of endpoints) {
    const epDirection =
      endpoint.bEndpointAddress & usb.LIBUSB_ENDPOINT_IN ? 'in' : 'out';
    const epType = endpoint.bmAttributes & epTypeMask;
    if (direction === epDirection && epType === usb.LIBUSB_TRANSFER_TYPE_BULK) {
      return endpoint.bEndpointAddress;
    }
  }
}

interface DeviceConfig {
  interface: number;
  configuration: number;
  writeEndpoint: number;
  readEndpoint: number;
  name: string;
}

function getStringDescriptor(
  device: usb.Device,
  id: number,
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    device.getStringDescriptor(id, (ex, value) => {
      if (ex) reject(ex);
      else resolve(value);
    });
  });
}

async function findDeviceEndpoints(
  device: usb.Device,
): Promise<DeviceConfig | undefined> {
  // If the device is already open, we won't be able to close it again, but also
  // we don't need to open it just to read descriptors
  if (!openedDevices.has(device)) device.open();

  try {
    const { allConfigDescriptors, deviceDescriptor } = device;
    const { iProduct } = deviceDescriptor;
    const productName = await getStringDescriptor(device, iProduct);

    for (const { bConfigurationValue, interfaces } of allConfigDescriptors) {
      let lastInterfaceName: string | undefined;

      for (const interfaceDescriptors of interfaces) {
        for (const {
          bInterfaceNumber,
          iInterface,
          endpoints,
        } of interfaceDescriptors) {
          const interfaceName = await getStringDescriptor(device, iInterface);
          if (interfaceName) lastInterfaceName = interfaceName;
          if (lastInterfaceName !== FITBIT_FDB_INTERFACE_NAME) continue;

          const writeEndpoint = findEndpoint(endpoints, 'out');
          const readEndpoint = findEndpoint(endpoints, 'in');

          if (
            writeEndpoint !== undefined &&
            readEndpoint !== undefined &&
            productName !== undefined
          ) {
            return {
              writeEndpoint,
              readEndpoint,
              interface: bInterfaceNumber,
              configuration: bConfigurationValue,
              name: productName,
            };
          }
        }
      }
    }
  } finally {
    if (!openedDevices.has(device)) device.close();
  }
}

export default class USBSerialDevice extends Duplex {
  private transfers: Set<Transfer> = new Set();

  constructor(
    private device: usb.Device,
    private intf: Interface,
    private readEndpoint: InEndpoint,
    private writeEndpoint: OutEndpoint,
  ) {
    super();
    usb.on('detach', this.handleDisconnect);
    this.on('close', () => void this.cleanup());
  }

  static async create(
    device: usb.Device,
    config: DeviceConfig,
  ): Promise<USBSerialDevice> {
    try {
      openedDevices.add(device);
      device.open(false);

      const setConfigurationFunc = promisify(device.setConfiguration).bind(
        device,
      );
      await setConfigurationFunc(config.configuration);

      const intf = device.interface(config.interface);
      intf.claim();

      const readEndpoint = intf.endpoint(config.readEndpoint) as InEndpoint;
      const writeEndpoint = intf.endpoint(config.writeEndpoint) as OutEndpoint;

      return new USBSerialDevice(device, intf, readEndpoint, writeEndpoint);
    } catch (ex) {
      openedDevices.delete(device);
      device.close();
      throw ex;
    }
  }

  static async list() {
    const usbDevices = usb.getDeviceList();

    const fitbitDevices: {
      opened: boolean;
      name: string;
      connect: () => Promise<Duplex>;
    }[] = [];

    for (const usbDevice of usbDevices) {
      const { deviceDescriptor } = usbDevice;

      if (deviceDescriptor.idVendor !== FITBIT_VENDOR_ID) continue;

      const deviceEndpoints = await findDeviceEndpoints(usbDevice);
      if (deviceEndpoints) {
        fitbitDevices.push({
          name: deviceEndpoints.name,
          get opened() {
            return openedDevices.has(usbDevice);
          },
          connect: () => USBSerialDevice.create(usbDevice, deviceEndpoints),
        });
      }
    }

    return fitbitDevices;
  }

  private async cleanup() {
    usb.off('detach', this.handleDisconnect);

    this.transfers.forEach((transfer) => transfer.cancel());
    this.transfers.clear();

    try {
      const releaseFunc = promisify(this.intf.release).bind(this.intf, true);
      await releaseFunc();
      this.device.close();
      openedDevices.delete(this.device);
    } catch (ex) {
      const msg = `Failed to close USB device: ${String(ex)}`;
      console.warn(msg);
      this.emit('error', new Error(msg));
    }
  }

  private handleDisconnect = (removedDevice: usb.Device) => {
    if (this.device === removedDevice) {
      this.destroy();
    }
  };

  // tslint:disable-next-line:function-name
  _read(size: number) {
    const buffer = Buffer.alloc(
      Math.min(size, this.readEndpoint.descriptor.wMaxPacketSize),
    );
    const transfer = this.readEndpoint.makeTransfer(
      0,
      (ex, buffer, bytesRead) => {
        if (ex) {
          this.emit('error', new Error(`USB read failed: ${String(ex)}`));
          return;
        }

        this.push(buffer.slice(0, bytesRead));
      },
    );
    transfer.submit(buffer);
    this.transfers.add(transfer);
  }

  // tslint:disable-next-line:function-name
  _write(chunk: Buffer, encoding: unknown, callback: (err?: Error) => void) {
    const transfer = this.writeEndpoint.makeTransfer(
      0,
      (ex, buffer, bytesWritten) => {
        if (ex) {
          callback(new Error(`USB write failed: ${String(ex)}`));
          return;
        }

        if (bytesWritten === chunk.byteLength) {
          callback();
        } else {
          callback(
            new Error(
              `USB write failed: wrote ${bytesWritten} of ${chunk.byteLength} bytes`,
            ),
          );
        }
      },
    );
    transfer.submit(chunk);
    this.transfers.add(transfer);
  }
}
