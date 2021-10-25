import 'stream.finished/auto';

import { RemoteHost } from '@fitbit/fdb-debugger';
import dateformat from 'dateformat';
import fs from 'fs';
import stream from 'stream';
import { SyncEvent } from 'ts-events';

import DeveloperRelay from '../models/DeveloperRelay';

import StreamTap from './StreamTap';

export type HostType = 'appHost' | 'companionHost';

export class HostConnection {
  private constructor(public ws: stream.Duplex, public host: RemoteHost) {}

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

  static async connect(ws: stream.Duplex) {
    return new this(ws, await RemoteHost.connect(ws, this.getDumpStreamTap()));
  }
}

export type HostAddedEvent = {
  hostType: HostType;
  host: RemoteHost;
};

class HostConnections {
  onHostAdded = new SyncEvent<HostAddedEvent>();
  appHost?: HostConnection;
  companionHost?: HostConnection;

  async connect(
    hostType: HostType,
    hostId: string,
    relayInstance: DeveloperRelay,
  ) {
    const existingHost = this[hostType];
    if (existingHost) existingHost.ws.destroy();

    const ws = await relayInstance.connect(hostId);
    const hostConnection = await HostConnection.connect(ws);
    this[hostType] = hostConnection;
    this.onHostAdded.post({ hostType, host: hostConnection.host });
    return hostConnection;
  }
}

export default HostConnections;
