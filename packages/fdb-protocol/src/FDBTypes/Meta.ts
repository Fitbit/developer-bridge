import * as t from 'io-ts';

import { PositiveInteger } from './Structures';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

/**
 * Extensions to the base protocol which either Endpoint may support.
 */
export const ProtocolCapabilities = t.partial(
  {
    /**
     * The Endpoint supports receiving Batch Request objects as
     * defined in JSON-RPC 2.0.
     */
    batchRequest: t.boolean,

    /**
     * The Endpoint supports receiving messages larger than the size
     * limit required by the protocol. This capability may only
     * increase the limit; a request or response is invalid if it
     * specifies a limit smaller than the protocol requirement.
     * The value MUST be a positive integer.
     */
    maxMessageSize: PositiveInteger,

    /**
     * Other object serialization schemes which this endpoint is capable
     * of receiving in addition to JSON.
     */
    additionalSerializations: t.array(t.string),
  },
  'ProtocolCapabilities',
);
export type ProtocolCapabilities = t.TypeOf<typeof ProtocolCapabilities>;

// Defined as a literal rather than an enum because of io-ts bug:
// https://github.com/gcanti/io-ts/issues/299
export const AdditionalSerializationCodec = t.literal('cbor-definite');
export type AdditionalSerializationType = t.TypeOf<
  typeof AdditionalSerializationCodec
>;

export const SerializationType = t.union([
  AdditionalSerializationCodec,
  t.literal('json'),
]);
export type SerializationType = t.TypeOf<typeof SerializationType>;

export const ProtocolSerializationChangeNotification = t.interface(
  {
    /**
     * Serialization scheme this Endpoint is about to switch to.
     */
    serialization: SerializationType,
  },
  'ProtocolSerializationChangeNotification',
);
export type ProtocolSerializationChangeNotification = t.TypeOf<
  typeof ProtocolSerializationChangeNotification
>;
