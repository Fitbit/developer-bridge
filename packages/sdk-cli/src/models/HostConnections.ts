import { RemoteHost } from '@fitbit/fdb-debugger';
import stream from 'stream';
import { SyncEvent } from 'ts-events';

import * as developerRelay from '../api/developerRelay';

export type HostType = 'appHost' | 'companionHost';

export class HostConnection {
  private constructor(
    public ws: stream.Duplex,
    public host: RemoteHost,
  ) {}

  static async connect(hostID: string) {
    const ws = await developerRelay.connect(hostID);
    return new this(ws, await RemoteHost.connect(ws));
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
