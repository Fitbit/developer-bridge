import { Duplex } from 'stream';

import { Interface, Socket } from '@fitbit/pulse';

const DEVBRIDGE_HEADER_SIZE = 2;
const DEVBRIDGE_PORT = 0x3e20;

const enum DevbridgePULSEPacketType {
  Data = 0,
}

export default class PULSEAdapter extends Duplex {
  private rxBuffer = Buffer.alloc(0);
  private lastPacketsRemaining?: number;

  private constructor(private intf: Interface, private socket: Socket) {
    super({ objectMode: true });

    this.on('close', () => void this.intf.close());
    this.socket.on('close', () => this.destroy());

    socket.on('data', (packet: Buffer) => {
      if (packet.byteLength < DEVBRIDGE_HEADER_SIZE) {
        this.emit(
          'error',
          new Error(`Packet with length below minimum allowed`),
        );
        return;
      }

      const [type, packetsFollowing] = new Uint8Array(packet);

      // Ignore non-data for now
      if (type !== DevbridgePULSEPacketType.Data) return;

      if (this.lastPacketsRemaining === undefined) {
        this.lastPacketsRemaining = packetsFollowing;
      } else if (this.lastPacketsRemaining !== packetsFollowing + 1) {
        const expected = this.lastPacketsRemaining - 1;
        this.emit(
          'error',
          new Error(
            `Received out of sequence packet, expected ${expected}, got ${packetsFollowing}`,
          ),
        );
      } else {
        this.lastPacketsRemaining -= 1;
      }

      this.rxBuffer = Buffer.concat([
        this.rxBuffer,
        packet.slice(DEVBRIDGE_HEADER_SIZE),
      ]);

      if (packetsFollowing === 0) {
        this.push(this.rxBuffer);
        this.rxBuffer = Buffer.alloc(0);
        this.lastPacketsRemaining = undefined;
      }
    });
  }

  static async create(stream: Duplex) {
    const intf = Interface.create(stream, {
      requestedTransports: ['reliable'],
    });
    const link = await intf.getLink();
    const socket = await link.openSocket('reliable', DEVBRIDGE_PORT);
    return new PULSEAdapter(intf, socket);
  }

  // tslint:disable-next-line:function-name
  _read() {
    // stub
  }

  // tslint:disable-next-line:function-name
  _write(buf: Buffer, encoding: unknown, callback: (err?: Error) => void) {
    try {
      const chunkSize = this.socket.mtu - DEVBRIDGE_HEADER_SIZE;
      let bytesSent = 0;
      let chunksLeft = Math.ceil(buf.byteLength / chunkSize);

      while (chunksLeft > 0) {
        const body = buf.slice(bytesSent, bytesSent + chunkSize);
        chunksLeft -= 1;
        bytesSent += body.byteLength;

        const header = new Uint8Array([
          DevbridgePULSEPacketType.Data,
          chunksLeft, // packetsFollowing
        ]);

        this.socket.send(Buffer.concat([header, body]));
      }
      callback();
    } catch (ex) {
      callback(ex as Error);
    }
  }
}
