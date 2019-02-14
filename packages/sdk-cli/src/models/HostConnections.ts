import { RemoteHost } from '@fitbit/fdb-debugger';
import fs from 'fs';
import stream from 'stream';
import { SyncEvent } from 'ts-events';

import * as developerRelay from '../api/developerRelay';

import StreamTap from './StreamTap';

export type HostType = 'appHost' | 'companionHost';

export class HostConnection {
  private constructor(
    public ws: stream.Duplex,
    public host: RemoteHost,
  ) {}

  static getDumpStreamTap() {
    const dumpLogFilePath = process.env.FITBIT_DEVBRIDGE_DUMP_PATH;
    if (dumpLogFilePath === undefined) return undefined;

    const dumpLogFileHandle = fs.openSync(dumpLogFilePath, 'w');
    const now = () => new Date().getTime();
    const epoch = now();

    function writeChunk(prefix: string) {
      return (chunk: any) => fs.writeSync(
        dumpLogFileHandle,
        `[${prefix}][${now() - epoch}] ${JSON.stringify(chunk, undefined, 2)}\n`,
      );
    }

    const transforms = {
      preSerializeTransform: new StreamTap(writeChunk('send')),
      postDeserializeTransform: new StreamTap(writeChunk('recv')),
    };

    stream.finished(
      transforms.postDeserializeTransform,
      () => fs.closeSync(dumpLogFileHandle),
    );

    return transforms;
  }

  static async connect(hostID: string) {
    const ws = await developerRelay.connect(hostID);
    return new this(
      ws,
      await RemoteHost.connect(
        ws,
        this.getDumpStreamTap(),
      ),
    );
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

  async connect(hostType: HostType, hostID: string) {
    const existingHost = this[hostType];
    if (existingHost) existingHost.ws.destroy();

    const hostConnection = await HostConnection.connect(hostID);
    this[hostType] = hostConnection;
    this.onHostAdded.post({ hostType, host: hostConnection.host });
    return hostConnection;
  }
}

export default HostConnections;
