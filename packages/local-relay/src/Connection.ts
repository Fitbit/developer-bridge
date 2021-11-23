import * as websocket from 'websocket';

import CloseCode from './CloseCode';
import { maxPayload } from './Config';

export default class Connection {
  private slavePeer?: websocket.connection;

  constructor(private masterPeer: websocket.connection) {
    this.masterPeer.on('message', this.onMasterMessage);
    this.masterPeer.on('close', this.onMasterClose);
  }

  public isHalfOpen(): boolean {
    return !this.slavePeer;
  }

  public connectPeer(slavePeer: websocket.connection): void {
    this.slavePeer = slavePeer;
    this.slavePeer.on('message', this.onSlaveMessage);
    this.slavePeer.on('close', this.onSlaveClose);
    this.sendHostHello();
  }

  public close(code: CloseCode): void {
    this.masterPeer.close(code);
    this.slavePeer?.close(code);
  }

  private sendHostHello(): void {
    this.masterPeer.send(
      JSON.stringify({
        maxPayload,
        relayEvent: 'connection',
      }),
    );
  }

  private forwardMessage(
    destination: websocket.connection | undefined,
    data: websocket.Message,
  ) {
    let payload;
    if (data.type === 'utf8') {
      payload = data.utf8Data!;
    } else if (data.type === 'binary') {
      payload = data.binaryData!;
    } else {
      console.error(`Invalid payload type: ${(data as any).type}`);
      this.close(CloseCode.PolicyViolation);
      return;
    }

    if (destination) {
      destination.send(payload);
    } else {
      this.close(CloseCode.PolicyViolation);
    }
  }

  private onMasterMessage = (data: websocket.Message) => {
    this.forwardMessage(this.slavePeer, data);
  };

  private onSlaveMessage = (data: websocket.Message) =>
    this.forwardMessage(this.masterPeer, data);

  private forwardClose(
    destination: websocket.connection | undefined,
    code: number,
    message: string,
  ) {
    if (destination) {
      const skipCloseFrame =
        code === websocket.connection.CLOSE_REASON_ABNORMAL;
      if (skipCloseFrame) {
        destination.drop(code, message, true);
      } else {
        destination.close(code, message);
      }
    }
  }

  private onMasterClose = (code: number, message: string) => {
    this.forwardClose(this.slavePeer, code, message);
  };

  private onSlaveClose = (code: number, message: string) => {
    this.forwardClose(this.masterPeer, code, message);
  };
}
