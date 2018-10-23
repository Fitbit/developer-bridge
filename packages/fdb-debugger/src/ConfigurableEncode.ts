import { Transform } from 'stream';

import { FDBTypes } from '@fitbit/fdb-protocol';
import * as cbor from 'cbor-js';

export type EncoderCallback = (data: any) => Buffer | string;

const encoders: {[key in FDBTypes.SerializationType]: (data: any) => Buffer | string} = {
  'cbor-definite': buf => Buffer.from(cbor.encode(buf)),
  json: JSON.stringify,
};

export default class ConfigurableEncode extends Transform {
  constructor(public encoder: FDBTypes.SerializationType = 'json') {
    super({ writableObjectMode: true });
  }

  canAcceptRawBuffers() {
    return this.encoder === 'cbor-definite';
  }

  setEncoder(encoder: FDBTypes.SerializationType) {
    this.encoder = encoder;
  }

  // tslint:disable-next-line:function-name
  _transform(chunk: any, encoding: string, callback: (err?: Error, data?: any) => void) {
    // This looks a bit weird, but if we do the write callback inside the try catch,
    // we end up calling the write callback twice and masking the original error
    // with a "you called write twice" error.
    let encodedChunk: Buffer | string;
    try {
      encodedChunk = encoders[this.encoder](chunk);
    } catch (e) {
      callback(e);
      return;
    }
    callback(undefined, encodedChunk);
  }
}
