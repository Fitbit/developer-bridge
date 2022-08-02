import PULSEAdapter from './PULSEAdapter';
import USBSerialDevice from './USBSerialDevice';

export async function list() {
  const devices = await USBSerialDevice.list();
  return devices.map((device) => ({
    displayName: device.name,
    available: !device.opened,
    roles: ['APP_HOST'],
    connect: async () => {
      const stream = await device.connect();
      return PULSEAdapter.create(stream);
    },
  }));
}
