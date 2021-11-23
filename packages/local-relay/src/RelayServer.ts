import express from 'express';
import * as websocket from 'websocket';
import * as http from 'http';
import * as net from 'net';

import HostStore from './HostStore';
import Host from './Host';

type RequestResponse = {
  status: number;
};

export default class RelayServer {
  private app = express();
  public readonly httpServer: http.Server;
  public readonly websocketServer: websocket.server;

  private hostStore = new HostStore();

  constructor() {
    this.app.disable('x-powered-by');

    this.httpServer = http.createServer(this.app);
    this.websocketServer = new websocket.server({
      httpServer: this.httpServer,
    });

    this.app
      .disable('x-powered-by')
      .get('/', this.onAppGetRoot)
      .get('/1/user/-/developer-relay/hosts.json', this.lookupHosts.bind(this))
      .post(
        '/1/user/-/developer-relay/hosts/:id',
        this.createConnectionURL.bind(this),
      );

    this.websocketServer.on('request', this.onRequest.bind(this));
  }

  public listen(port = 0): number {
    this.httpServer.listen(port);
    return (this.httpServer.address() as net.AddressInfo).port;
  }

  public close(): void {
    this.httpServer.close();
  }

  public get port(): number {
    return (this.httpServer.address() as net.AddressInfo).port;
  }

  private reject(
    request: websocket.request,
    status: number,
    reason?: string,
  ): RequestResponse {
    request.reject(status, reason);
    return { status };
  }

  private rejectWithError(
    request: websocket.request,
    status: number,
    message: string,
  ) {
    console.error(message);
    return this.reject(request, status, message);
  }

  private accept(request: websocket.request, status = 200): RequestResponse {
    request.accept();
    return { status };
  }

  private async onRequest(request: websocket.request) {
    const headers = request.httpRequest.headers;

    const hostId = headers['x-relay-host-id'] as string;
    const displayName = headers['x-relay-host-display-name'] as string;
    const rolesHeader = headers['x-relay-host-roles'] as string;
    const isHostConnectionAttempted = hostId && displayName;

    const requestedResource =
      (headers['x-relay-resource'] as string) || request.resource;
    const peerHostId = requestedResource.split('/')?.[1];
    const isClientConnectionAttempted = Boolean(peerHostId);

    if (isHostConnectionAttempted && isClientConnectionAttempted) {
      return this.rejectWithError(
        request,
        400,
        'Ambiguous connection, both authenticated and connection token provided',
      );
    }

    if (!isHostConnectionAttempted && !isClientConnectionAttempted) {
      return this.rejectWithError(
        request,
        401,
        'Unrecognized connection type, neither authenticated nor connection token provided',
      );
    }

    if (isHostConnectionAttempted) {
      let roles: string[];

      try {
        roles = this.getHostRoles(rolesHeader);
      } catch (error) {
        return this.reject(request, 400, (error as Error).message);
      }

      const host: Host = this.hostStore.addOrReplace({
        displayName,
        roles,
        id: hostId,
      });

      // Emitted after request.accept() (see end of fn)
      request.on('requestAccepted', (ws: websocket.connection) => {
        host.connect(ws);
        console.info(`Accepting host connection ID ${host.id}`);
      });
      // "else" == "else if isClientConnectionAttempted", because of the 2 if statements above
    } else {
      const host = this.hostStore.get(peerHostId);

      if (!host) {
        return this.reject(request, 404, 'Invalid or expired connection token');
      }

      if (!host.isConnected()) {
        return this.reject(request, 500, `Host ${host.id} is not connected`);
      }

      if (!host.canConnectPeer()) {
        return this.reject(
          request,
          403,
          `Host ${host.id} is already connected to a peer`,
        );
      }

      // Emitted after request.accept() (see end of fn)
      request.on('requestAccepted', (ws: websocket.connection) => {
        try {
          host.connectPeer(ws);
        } catch (error) {
          return this.rejectWithError(request, 500, (error as Error).message);
        }
      });
    }

    return this.accept(request);
  }

  private onAppGetRoot(_: express.Request, response: express.Response) {
    response.status(426);
    response.send('Upgrade Required');
  }

  private async lookupHosts(_: express.Request, response: express.Response) {
    const hosts = this.hostStore.listAll();

    response.json({
      hosts: hosts.map((host) => ({
        id: host.id,
        displayName: host.displayName,
        roles: host.roles,
        state: host.canConnectPeer() ? 'available' : 'busy',
      })),
    });
  }

  private async createConnectionURL(
    request: express.Request,
    response: express.Response,
  ) {
    const { id } = request.params;
    response.setHeader('content-type', 'text/uri-list');
    response.send(
      `ws://localhost:${
        (this.httpServer.address() as net.AddressInfo).port
      }/${id}\r\n`,
    );
  }

  private getHostRoles(rolesHeader: string) {
    if (!rolesHeader) return [];

    const roles = rolesHeader
      .split(',')
      .map((role: string) => role.trim().toUpperCase());

    const roleRegex = /^[a-zA-Z0-9_]+$/;

    for (const role of roles) {
      if (!role.match(roleRegex)) {
        throw new Error(
          `Invalid role specified: ${role}. Only alphanumeric and _ characters allowed.`,
        );
      }
    }

    return roles;
  }
}
