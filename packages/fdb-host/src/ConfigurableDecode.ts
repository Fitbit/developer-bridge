import { Transform } from 'stream';

import { FDBTypes } from '@fitbit/fdb-protocol';
import * as cbor from 'cbor';

export type DecoderCallback = (data: any) => unknown;

const decoders: { [key in FDBTypes.SerializationType]: DecoderCallback } = {
  'cbor-definite': cbor.decode,
  json: JSON.parse,
};

export default class ConfigurableDecode extends Transform {
  constructor(public decoder: FDBTypes.SerializationType = 'json') {
    super({ readableObjectMode: true });
  }

  canAcceptRawBuffers() {
    return this.decoder === 'cbor-definite';
  }

  setDecoder(encoder: FDBTypes.SerializationType) {
    this.decoder = encoder;
  }

  // tslint:disable-next-line:function-name
  _transform(
    chunk: any,
    encoding: string,
    callback: (err?: Error, data?: any) => void,
  ) {
    // This looks a bit weird, but if we do the write callback inside the try catch,
    // we end up calling the write callback twice and masking the original error
    // with a "you called write twice" error.
    let decodedChunk: unknown;
    try {
      decodedChunk = decoders[this.decoder](chunk);
    } catch (e) {
      callback(e as Error);
      return;
    }
    callback(undefined, decodedChunk);
  }
}
