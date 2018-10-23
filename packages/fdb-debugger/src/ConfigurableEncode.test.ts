import * as cbor from 'cbor-js';
import { FDBTypes } from '@fitbit/fdb-protocol';

import ConfigurableEncode, { EncoderCallback } from './ConfigurableEncode';

let stream: ConfigurableEncode;
let dataCallback: jest.Mock;
let errorCallback: jest.Mock;
let encoderSpy: jest.MockInstance<any>;

beforeEach(() => {
  stream = new ConfigurableEncode();
  dataCallback = jest.fn();
  errorCallback = jest.fn();
  stream.on('data', dataCallback);
  stream.on('error', errorCallback);
  encoderSpy = jest.spyOn(cbor, 'encode');
});

const testCases: [FDBTypes.SerializationType, EncoderCallback][] = [
  ['cbor-definite', obj => Buffer.from(cbor.encode(obj))],
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
  encoderSpy.mockImplementation(() => { throw new Error(); });
  stream.write({ foo: 'bar' });
  expect(errorCallback).toBeCalledWith(expect.any(Error));
});
