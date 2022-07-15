import { WebUSB } from 'usb';
import { Duplex } from 'stream';

const FITBIT_VENDOR_ID = 0x2687;
const FITBIT_FDB_INTERFACE_NAME = 'CDC-FDB';

function findEndpoint(
  endpoints: USBEndpoint[],
  direction: USBDirection,
  type: USBEndpointType,
): USBEndpoint | undefined {
  const matches = endpoints.filter(
    (ep) => ep.direction === direction && ep.type === type,
  );
  return matches.length > 0 ? matches[0] : undefined;
}

interface DeviceConfig {
  configuration: number;
  interface: number;
  writeEndpoint: USBEndpoint;
  readEndpoint: USBEndpoint;
  name: string;
}

function findDeviceEndpoints(device: USBDevice): DeviceConfig | undefined {
  for (const { interfaces, configurationValue } of device.configurations) {
    let ifname: string | undefined;
    for (const { alternates, interfaceNumber } of interfaces) {
      for (const { interfaceName, endpoints } of alternates) {
        if (interfaceName && interfaceName.length > 0) {
          ifname = interfaceName;
        }

        if (ifname !== FITBIT_FDB_INTERFACE_NAME) continue;

        const writeEndpoint = findEndpoint(endpoints, 'out', 'bulk');
        const readEndpoint = findEndpoint(endpoints, 'in', 'bulk');

        if (
          writeEndpoint !== undefined &&
          readEndpoint !== undefined &&
          device.productName !== undefined &&
          device.manufacturerName !== undefined
        ) {
          return {
            writeEndpoint,
            readEndpoint,
            configuration: configurationValue,
            interface: interfaceNumber,
            name: `${device.manufacturerName} ${device.productName}`,
          };
        }
      }
    }
  }

  return undefined;
}

export default class USBSerialDevice extends Duplex {
  constructor(private device: USBDevice, private config: DeviceConfig) {
    super();
    this.on('close', () => void this.cleanup());
  }

  private static async create(
    device: USBDevice,
    config: DeviceConfig,
  ): Promise<Duplex> {
    try {
      await device.open();
      await device.selectConfiguration(config.configuration);
      await device.claimInterface(config.interface);

      return new USBSerialDevice(device, config);
    } catch (ex) {
      await device.close();
      throw ex;
    }
  }

  static async list() {
    const webUSB = new WebUSB({ allowAllDevices: true });
    const usbDevices = await webUSB.getDevices();
    const fitbitDevices: {
      opened: boolean;
      name: string;
      connect: () => Promise<Duplex>;
    }[] = [];

    for (const usbDevice of usbDevices) {
      if (usbDevice.vendorId !== FITBIT_VENDOR_ID) continue;
      const deviceEndpoints = findDeviceEndpoints(usbDevice);
      if (deviceEndpoints) {
        fitbitDevices.push({
          name: usbDevice.productName!,
          opened: usbDevice.opened,
          connect: () => USBSerialDevice.create(usbDevice, deviceEndpoints),
        });
      }
    }

    return fitbitDevices;
  }

  private async cleanup() {
    try {
      // We have to reset before we can close because otherwise it fails
      // if a transfer is in progress
      await this.device.reset();
      await this.device.close();
    } catch (ex) {
      this.emit(
        'error',
        new Error(`Failed to close USB device: ${String(ex)}`),
      );
    }
  }

  // tslint:disable-next-line:function-name
  _read(size: number) {
    const { packetSize } = this.config.readEndpoint;

    void this.device
      .transferIn(
        this.config.readEndpoint.endpointNumber,
        Math.min(packetSize, size),
      )
      .then(
        (result) => {
          if (result.status === 'ok' && result.data !== undefined) {
            this.push(
              Buffer.from(
                result.data.buffer,
                result.data.byteOffset,
                result.data.byteLength,
              ),
            );
          } else {
            this.emit(
              'error',
              new Error(`USB read failed: ${String(result.status)}`),
            );
          }
        },
        (ex) => {
          this.emit('error', new Error(`USB read failed: ${String(ex)}`));
        },
      );
  }

  // tslint:disable-next-line:function-name
  _write(chunk: Buffer, encoding: unknown, callback: (err?: Error) => void) {
    this.device
      .transferOut(this.config.writeEndpoint.endpointNumber, chunk)
      .then(
        ({ status, bytesWritten }) => {
          if (status === 'ok' && bytesWritten === chunk.byteLength) {
            callback();
          } else {
            callback(
              new Error(
                `USB write failed: ${status}, wrote ${bytesWritten} of ${chunk.byteLength} bytes`,
              ),
            );
          }
        },
        (ex) => callback(new Error(`USB write failed: ${String(ex)}`)),
      );
  }
}
