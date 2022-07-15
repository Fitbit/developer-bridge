import 'stream.finished/auto';

import { RemoteHost } from '@fitbit/fdb-debugger';
import dateformat from 'dateformat';
import fs from 'fs';
import stream, { Duplex } from 'stream';
import { SyncEvent } from 'ts-events';

import * as developerRelay from '../api/developerRelay';
import * as USBDebugHost from './USBDebugHost';
import { DeviceType, HostType } from './HostTypes';

import StreamTap from './StreamTap';

export class HostConnection {
  private constructor(public stream: stream.Duplex, public host: RemoteHost) {}

  static getDumpStreamTap() {
    const shouldDumpLogFile = process.env.FITBIT_DEVBRIDGE_DUMP === '1';
    if (!shouldDumpLogFile) return undefined;

    const dumpLogFilePath = dateformat('"log" yyyy-mm-dd "at" H.MM.ss."txt"');
    const dumpLogFileHandle = fs.openSync(dumpLogFilePath, 'w');
    const now = () => new Date().getTime();
    const epoch = now();

    function writeChunk(prefix: string) {
      return (chunk: any) =>
        fs.writeSync(
          dumpLogFileHandle,
          `[${prefix}][${now() - epoch}] ${JSON.stringify(
            chunk,
            undefined,
            2,
          )}\n`,
        );
    }

    const transforms = {
      preSerializeTransform: new StreamTap(writeChunk('send')),
      postDeserializeTransform: new StreamTap(writeChunk('recv')),
    };

    stream.finished(transforms.postDeserializeTransform, () =>
      fs.closeSync(dumpLogFileHandle),
    );

    return transforms;
  }

  static async connect(stream: Duplex) {
    return new this(
      stream,
      await RemoteHost.connect(stream, this.getDumpStreamTap()),
    );
  }
}

export type HostAddedEvent = {
  hostType: HostType;
  host: RemoteHost;
};

export interface Host {
  connect(): Promise<Duplex>;
  displayName: string;
  available: boolean;
  roles: string[];
}

class HostConnections {
  onHostAdded = new SyncEvent<HostAddedEvent>();
  appHost?: HostConnection;
  companionHost?: HostConnection;

  async connect(host: Host, deviceType: DeviceType) {
    const hostTypes: { [key in DeviceType]: HostType } = {
      device: 'appHost',
      phone: 'companionHost',
    };
    const hostType = hostTypes[deviceType];

    const existingHost = this[hostType];
    if (existingHost) existingHost.stream.destroy();

    const stream = await host.connect();

    let hostConnection: HostConnection;
    try {
      hostConnection = await HostConnection.connect(stream);
    } catch (ex) {
      stream.destroy();
      throw ex;
    }

    this[hostType] = hostConnection;
    this.onHostAdded.post({ hostType, host: hostConnection.host });
    return hostConnection;
  }

  async list() {
    const hosts: Host[] = [];

    try {
      for (const device of await developerRelay.hosts()) {
        hosts.push(device);
      }
    } catch (error) {
      throw new Error(
        `An error was encountered when loading the list of available Developer Relay hosts: ${
          (error as Error).message
        }`,
      );
    }

    try {
      for (const device of await USBDebugHost.list()) {
        hosts.push(device);
      }
    } catch (error) {
      throw new Error(
        `An error was encountered when loading the list of available USB hosts: ${
          (error as Error).message
        }`,
      );
    }

    return hosts;
  }

  async listOfType(deviceType: DeviceType) {
    const hosts = await this.list();

    const hostRole = {
      device: 'APP_HOST',
      phone: 'COMPANION_HOST',
    }[deviceType];

    return hosts.filter((host) => host.roles.includes(hostRole));
  }
}

export default HostConnections;
