import * as t from 'io-ts';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

/**
 * Bulk data transfer capabilities which either Endpoint may support.
 */
export const IOCapabilities = t.partial(
  {
    /**
     * The Endpoint supports having data written to an open stream by
     * supporting the 'io.write' notification.
     */
    write: t.boolean,

    /**
     * Additional transfer encodings which are supported for data transfer
     * Requests to, and Responses from, this Endpoint.
     */
    additionalEncodings: t.array(t.string),
  },
  'IOCapabilities',
);
export type IOCapabilities = t.TypeOf<typeof IOCapabilities>;

/**
 * A reference to an open IO stream. Numeric tokens SHOULD NOT contain
 * fractional parts.
 */
export const StreamToken = t.union([t.Integer, t.string], 'StreamToken');
export type StreamToken = t.TypeOf<typeof StreamToken>;

/**
 * A result type for responses to requests which open a stream.
 */
export const StreamOpenResponse = t.interface(
  {
    /**
     * The token for the newly-opened stream.
     */
    stream: StreamToken,
  },
  'StreamOpenResponse',
);
export type StreamOpenResponse = t.TypeOf<typeof StreamOpenResponse>;

/**
 * A type for params of requests which close a stream.
 */
export const StreamCloseParams = t.interface(
  {
    /**
     * The token for the stream to close.
     */
    stream: StreamToken,
  },
  'StreamCloseParams',
);
export type StreamCloseParams = t.TypeOf<typeof StreamCloseParams>;

export const IOEncoding = t.union([
  t.literal('base64'),
  t.literal('none'),
]);
export type IOEncoding = t.TypeOf<typeof IOEncoding>;

export class NodeBufferType extends t.Type<Buffer> {
  readonly _tag: 'NodeBufferType' = 'NodeBufferType';
  constructor() {
    super(
      'Buffer',
      (m): m is Buffer => Buffer.isBuffer(m),
      (m, c) => (this.is(m) ? t.success(m) : t.failure(m, c)),
      t.identity,
    );
  }
}
export const NodeBuffer = new NodeBufferType();

export const IOWriteParams = t.intersection(
  [
    t.interface({
      /**
       * Token identifying the stream to apply the write to.
       */
      stream: StreamToken,

      /**
       * Data to write to the stream.
       */
      data: t.union([
        t.string,
        NodeBuffer,
      ]),
    }),
    t.partial({
      /**
       * Transfer encoding which has been applied to the data parameter.
       * Defaults to 'base64'.
       */
      encoding: IOEncoding,
    }),
  ],
  'IOWriteParams',
);
export type IOWriteParams = t.TypeOf<typeof IOWriteParams>;
