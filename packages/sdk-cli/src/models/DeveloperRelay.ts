import * as t from 'io-ts';
import stream from 'stream';
import websocketStream from 'websocket-stream';

import * as localRelay from '../models/localRelay';
import { apiFetch, assertAPIResponseOK, decodeJSON } from '../api/baseAPI';
import { assertContentType } from '../util/fetchUtil';
import environment from '../auth/environment';

// tslint:disable-next-line:variable-name
export const Host = t.type(
  {
    id: t.string,
    displayName: t.string,
    roles: t.array(t.string),
    state: t.union([t.literal('available'), t.literal('busy')]),
  },
  'Host',
);
export type Host = t.TypeOf<typeof Host>;

export type Hosts = { appHost: Host[]; companionHost: Host[] };

// tslint:disable-next-line:variable-name
const HostsResponse = t.type(
  {
    hosts: t.array(Host),
  },
  'HostsResponse',
);

export default class DeveloperRelay {
  constructor(
    private readonly apiUrl: string = environment().config.apiUrl,
    private readonly shouldAuth: boolean = true,
  ) {}

  static async create(local = false) {
    if (local) {
      const { port } = await localRelay.instance();
      return new DeveloperRelay(`http://localhost:${port}`, false);
    }

    return new DeveloperRelay();
  }

  async connect(hostID: string): Promise<stream.Duplex> {
    const url = await this.getConnectionURL(hostID);

    return createWebSocket(url);
  }

  async hosts(): Promise<Hosts> {
    const response = await apiFetch(
      '1/user/-/developer-relay/hosts.json',
      undefined,
      this.apiUrl,
      this.shouldAuth,
    ).then(decodeJSON(HostsResponse));

    const hostsWithRole = (role: string) =>
      response.hosts.filter((host) => host.roles.includes(role));

    return {
      appHost: hostsWithRole('APP_HOST'),
      companionHost: hostsWithRole('COMPANION_HOST'),
    };
  }

  private async getConnectionURL(hostID: string): Promise<string> {
    const response = await apiFetch(
      `1/user/-/developer-relay/hosts/${hostID}`,
      {
        method: 'POST',
      },
      this.apiUrl,
      this.shouldAuth,
    )
      .then(assertAPIResponseOK)
      .then(assertContentType('text/uri-list'));

    const uriList = (await response.text())
      .split('\r\n')
      .filter((line) => line[0] !== '#');

    return uriList[0];
  }
}

function createWebSocket(uri: string): Promise<stream.Duplex> {
  return new Promise<stream.Duplex>((resolve, reject) => {
    const ws = websocketStream(uri, { objectMode: true });
    ws.on('connect', () => resolve(ws));
    ws.on('error', (e) => reject(e));
  });
}
