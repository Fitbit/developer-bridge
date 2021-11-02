import * as cbor from 'cbor';
import { FDBTypes } from '@fitbit/fdb-protocol';

import ConfigurableDecode from './ConfigurableDecode';

let stream: ConfigurableDecode;
let dataCallback: jest.Mock;
let errorCallback: jest.Mock;

jest.mock('cbor', () => ({
  decode: jest.fn(jest.requireActual('cbor').decode),
}));

beforeEach(() => {
  stream = new ConfigurableDecode();
  dataCallback = jest.fn();
  errorCallback = jest.fn();
  stream.on('data', dataCallback);
  stream.on('error', errorCallback);
});

const expectedData = { a: 1 };
const testCases: [FDBTypes.SerializationType, string | ArrayBufferView][] = [
  ['cbor-definite', new Uint8Array([0xa1, 0x61, 0x61, 0x01])],
  ['json', `{ "a": 1 }`],
];

it.each(testCases)('decodes data in %s', async (encoding, data) => {
  stream.setDecoder(encoding);
  stream.write(data);
  expect(dataCallback).toBeCalledWith(expectedData);
});

it.each(testCases)(
  'exposes current encoding via encoder property',
  (encoding) => {
    stream.setDecoder(encoding);
    expect(stream.decoder).toBe(encoding);
  },
);

it('emits an error if decoding fails', async () => {
  jest.spyOn(cbor, 'decode').mockImplementation(() => {
    throw new Error('decoding failed :(');
  });

  const errorPromise = new Promise((resolve) => {
    stream.on('error', resolve);
  });

  stream.setDecoder('cbor-definite');
  stream.write(new Uint8Array(1));
  await errorPromise;

  expect(errorCallback).toBeCalledWith(expect.any(Error));
});
