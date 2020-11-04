import * as cbor from 'cbor';
import { FDBTypes } from '@fitbit/fdb-protocol';

import ConfigurableEncode, { EncoderCallback } from './ConfigurableEncode';

let stream: ConfigurableEncode;
let dataCallback: jest.Mock;
let errorCallback: jest.Mock;

jest.mock('cbor', () => ({
  encode: jest.fn(jest.requireActual('cbor').encode),
}));

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

  let expectedData: ArrayBufferView | string = encoder(data);
  if (typeof expectedData === 'string') {
    expectedData = Buffer.from(expectedData);
  }

  expect(dataCallback).toBeCalledWith(expectedData);
});

it.each(testCases)(
  'exposes current encoding via encoder property',
  (encoding) => {
    stream.setEncoder(encoding);
    expect(stream.encoder).toBe(encoding);
  },
);

it('emits an error if encoding fails', async () => {
  jest.spyOn(cbor, 'encode').mockImplementation(() => {
    throw new Error('encoding failed :(');
  });

  const errorPromise = new Promise((resolve) => {
    stream.on('error', resolve);
  });

  stream.setEncoder('cbor-definite');
  stream.write({});
  await errorPromise;

  expect(errorCallback).toBeCalledWith(expect.any(Error));
});
