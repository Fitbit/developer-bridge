import * as websocket from 'websocket';
import CloseCode from './CloseCode';
import Connection from './Connection';

export type HostInfo = {
  id: string;
  displayName: string;
  roles: string[];
};

export default class Host {
  /* tslint:disable:variable-name */
  private _id: string;

  get id(): string {
    return this._id;
  }

  private _displayName: string;

  get displayName(): string {
    return this._displayName;
  }

  private _roles: string[];

  get roles(): string[] {
    return this._roles;
  }

  private connection?: Connection;
  /* tslint:enable:variable-name */

  constructor({ id, displayName, roles }: HostInfo) {
    this._id = id;
    this._displayName = displayName;
    this._roles = roles;
  }

  connect(ws: websocket.connection): void {
    ws.on('close', () => {
      this.connection = undefined;
    });

    this.connection = new Connection(ws);
  }

  isConnected(): boolean {
    return Boolean(this.connection);
  }

  disconnect(): void {
    if (!this.connection) {
      console.info(
        `Host ${this._id} is not connected; cannot close connection`,
      );

      return;
    }

    this.connection.close(CloseCode.GoingAway);
  }

  connectPeer(peerWs: websocket.connection) {
    if (!this.connection) {
      throw new Error(`Host ${this._id} is not connected`);
    }

    if (!this.canConnectPeer()) {
      throw new Error(`Host ${this._id} is already connected to a peer`);
    }

    this.connection.connectPeer(peerWs);
  }

  canConnectPeer() {
    return this.connection?.isHalfOpen();
  }
}
