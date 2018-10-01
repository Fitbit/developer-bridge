import * as cbor from 'cbor';
import { FDBTypes } from '@fitbit/fdb-protocol';

import ConfigurableEncode, { EncoderCallback } from './ConfigurableEncode';

let stream: ConfigurableEncode;
let dataCallback: jest.Mock;
let errorCallback: jest.Mock;

beforeEach(() => {
  stream = new ConfigurableEncode();
  dataCallback = jest.fn();
  errorCallback = jest.fn();
  stream.on('data', dataCallback);
  stream.on('error', errorCallback);
});

const testCases: [FDBTypes.SerializationType, EncoderCallback][] = [
  ['cbor-definite', cbor.encode],
  ['json', JSON.stringify],
];

it.each(testCases)('encodes data in %s', async (encoding, encoder) => {
  stream.setEncoder(encoding);
  const data = { a: 1 };
  stream.write(data);
  expect(dataCallback).toBeCalledWith(Buffer.from(encoder(data)));
});

it.each(testCases)('exposes current encoding via encoder property', (encoding) => {
  stream.setEncoder(encoding);
  expect(stream.encoder).toBe(encoding);
});

it('emits an error if encoding fails', () => {
  // Forcing an encoding error by trying to CBOR encode a function (which will throw)
  stream.setEncoder('cbor-definite');
  stream.write({ func: () => {} });
  expect(errorCallback).toBeCalledWith(expect.any(Error));
});
