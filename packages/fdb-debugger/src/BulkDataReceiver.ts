import { InvalidParams, TypesafeRequestDispatcher } from '@fitbit/jsonrpc-ts';

import { BulkData, BulkDataStream, FDBTypes } from '@fitbit/fdb-protocol';

interface StreamContext {
  stream: BulkDataStream;
  resolve: (buffer: Buffer) => void;
  reject: (reason: any) => void;
}

/**
 * A convenient handler for receiving incoming bulk data streams for the
 * simple case where finalize always succeeds with no response data.
 *
 * More work is needed to make it generalizable enough to be used for
 * the app install process in fdb-host.
 */
export default class BulkDataReceiver {
  private contexts = new Map<FDBTypes.StreamToken, StreamContext>();

  constructor(
    public bulkData: BulkData,
    public name: string,
  ) {}

  /**
   * Create an incoming bulk data stream wrapped in a Promise.
   *
   * @param executor function to request the stream from the remote peer.
   *
   * The executor function is called with the bulk data stream object,
   * and is responsible for requesting the data from the remote peer.
   * The stream is only considered open once the executor function
   * returns, or, if it returns a `Promise`, the returned `Promise`
   * resolves.
   *
   * The bulk data stream is automatically closed if the executor throws
   * or rejects.
   *
   * @example
   *   receiver.receiveFromStream(stream => requestData(stream.token))
   *     .then(buffer => useData(buffer))
   *     .catch(err => getDataFailed(err));
   */
  receiveFromStream(executor: (stream: BulkDataStream) => any): Promise<Buffer> {
    // We create the stream and pass it into the executor so that we can
    // clean up the stream if the executor throws or rejects.
    const stream = this.bulkData.createWriteStream();
    return new Promise((resolve, reject) => {
      new Promise(resolve => resolve(executor(stream)))
        .then(() => {
          this.contexts.set(stream.token, { stream, resolve, reject });
        })
        .catch((reason) => {
          stream.finalize();
          reject(reason);
        });
    });
  }

  private popStreamContext(token: FDBTypes.StreamToken) {
    const context = this.contexts.get(token);
    if (context !== undefined) {
      this.contexts.delete(token);
      return context;
    }
    throw new InvalidParams(
      `Stream token does not match any open ${this.name} stream`,
      { stream: token },
    );
  }

  finalizeStream = ({ stream }: FDBTypes.StreamCloseParams) => {
    const context = this.popStreamContext(stream);
    context.resolve(context.stream.finalize());
  }

  abortStream = ({ stream }: FDBTypes.StreamCloseParams) => {
    const context = this.popStreamContext(stream);
    context.stream.finalize();
    context.reject('Aborted by host');
  }

  /**
   * Register stream finalize and abort methods on a request dispatcher.
   *
   * Register the stream finalize and abort RPC methods in the common
   * case where both the finalize and abort method take
   * `StreamCloseParams` as arguments and return nothing.
   */
  registerCloserMethods(dispatcher: TypesafeRequestDispatcher, methodPrefix: string): void;
  registerCloserMethods(
    dispatcher: TypesafeRequestDispatcher,
    finalizeMethod: string,
    abortMethod: string,
  ): void;
  registerCloserMethods(
    dispatcher: TypesafeRequestDispatcher,
    finalizeMethod: string,
    abortMethod?: string,
  ) {
    const finalize = abortMethod ? finalizeMethod : `${finalizeMethod}.finalize`;
    const abort = abortMethod || `${finalizeMethod}.abort`;
    dispatcher
      .method(finalize, FDBTypes.StreamCloseParams, this.finalizeStream)
      .method(abort, FDBTypes.StreamCloseParams, this.abortStream);
  }
}
