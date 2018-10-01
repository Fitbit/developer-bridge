import { InvalidParams, TypesafeRequestDispatcher } from '@fitbit/jsonrpc-ts';
import invariant = require('invariant');
import isBase64 = require('validator/lib/isBase64');

import * as types from './FDBTypes';

export type WriteCallback = (length: number, sum: number) => void;
export type FinalizeCallback = (buffer: Buffer) => void;

export class BulkDataStream {
  token: types.StreamToken;
  length = 0;
  onWrite?: WriteCallback;
  private data: Buffer[] = [];
  private disposer: () => void;

  /** @internal */
  constructor(token: types.StreamToken, disposer: () => void, onWrite?: WriteCallback) {
    this.token = token;
    this.disposer = disposer;
    this.onWrite = onWrite;
  }

  /** @internal */
  write(buffer: Buffer) {
    this.data.push(buffer);
    this.length += buffer.length;
    if (this.onWrite) this.onWrite(buffer.length, this.length);
  }

  finalize() {
    this.disposer();
    return Buffer.concat(this.data);
  }
}

export default class BulkData {
  private streams = new Map<types.StreamToken, BulkDataStream>();

  private nextToken = 0;

  /** Register with a request dispatcher. */
  register(dispatcher: TypesafeRequestDispatcher) {
    dispatcher.method('io.write', types.IOWriteParams, this.handleWrite);
  }

  private getStream(token: types.StreamToken) {
    const stream = this.streams.get(token);
    if (stream !== undefined) return stream;
    throw new InvalidParams('Unknown bulk data stream', { stream: token });
  }

  private handleWrite = ({ stream: token, data, encoding = 'base64' }: types.IOWriteParams) => {
    const stream = this.getStream(token);

    if (encoding === 'base64') {
      // Yay NodeJS! https://github.com/nodejs/node/issues/8569
      if (typeof data !== 'string' || !isBase64(data)) {
        throw new InvalidParams('Data is not valid for encoding', { encoding });
      }
      stream.write(Buffer.from(data, encoding));
    } else if (encoding === 'none') {
      if (!Buffer.isBuffer(data)) {
        throw new InvalidParams('Data is not valid for encoding', { encoding });
      }
      stream.write(data as Buffer);
    } else {
      throw new InvalidParams('Invalid encoding', { encoding });
    }
  }

  createWriteStream(onWrite?: WriteCallback) {
    const token: types.StreamToken = this.nextToken;
    this.nextToken += 1;

    invariant(!this.streams.has(token), 'Stream token already exists');
    const stream = new BulkDataStream(token, () => this.streams.delete(token), onWrite);
    this.streams.set(token, stream);
    return stream;
  }
}
