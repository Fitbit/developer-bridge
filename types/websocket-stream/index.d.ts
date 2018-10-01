// DefinitelyTyped style says indent = 4 spaces
// tslint:disable:function-name ter-indent

import * as EventEmitter from 'events';
import * as stream from 'stream';
import WebSocket = require('ws');

export = WebSocketStream;

declare function WebSocketStream(
    target: WebSocket | string,
    protocols: string[] | string,
    options: WebSocketStream.IClientOptions,
): WebSocketStream.Stream;
declare function WebSocketStream(
    target: WebSocket | string,
    protocols: string[] | string,
): WebSocketStream.Stream;
declare function WebSocketStream(
    target: WebSocket | string,
    options?: WebSocketStream.IClientOptions,
): WebSocketStream.Stream;

declare namespace WebSocketStream {
    interface Stream extends stream.Duplex {
      socket: WebSocket;
      destroy(err?: any): void;
    }

    interface IClientOptions extends WebSocket.ClientOptions {
        browserBufferSize?: number;
        browserBufferTimeout?: number;
        objectMode?: boolean;
        binary?: boolean;
        perMessageDeflate?: boolean;
    }

    interface IServerOptions extends WebSocket.ServerOptions {
        objectMode?: boolean;
      binary?: boolean;
    }

    class Server extends WebSocket.Server {
      constructor(
          opts: WebSocketStream.IServerOptions,
          cb?: (stream: Stream) => void,
        );

      on(event: 'stream', cb: (stream: Stream) => void): this;
      on(event: string, listener: Function): this;

      addListener(event: 'stream', cb: (stream: Stream) => void): this;
      addListener(event: string, listener: Function): this;
    }

    function createServer(
      opts: WebSocketStream.IServerOptions,
      cb?: (stream: Stream) => void,
    ): Server;
}
