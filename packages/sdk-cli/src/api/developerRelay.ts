import * as t from 'io-ts';
import stream from 'stream';
import websocketStream from 'websocket-stream';

import { apiFetch, assertAPIResponseOK, decodeJSON } from './baseAPI';
import { assertContentType } from '../util/fetchUtil';

// tslint:disable-next-line:variable-name
export const RelayHost = t.type(
  {
    id: t.string,
    displayName: t.string,
    roles: t.array(t.string),
    state: t.union([t.literal('available'), t.literal('busy')]),
  },
  'Host',
);
export type RelayHost = t.TypeOf<typeof RelayHost>;

// tslint:disable-next-line:variable-name
const HostsResponse = t.type(
  {
    hosts: t.array(RelayHost),
  },
  'HostsResponse',
);

async function getConnectionURL(hostID: string) {
  const response = await apiFetch(`1/user/-/developer-relay/hosts/${hostID}`, {
    method: 'POST',
  })
    .then(assertAPIResponseOK)
    .then(assertContentType('text/uri-list'));
  const uriList = (await response.text())
    .split('\r\n')
    .filter((line) => line[0] !== '#');
  return uriList[0];
}

function createWebSocket(uri: string) {
  return new Promise<stream.Duplex>((resolve, reject) => {
    const ws = websocketStream(uri, { objectMode: true });
    ws.on('connect', () => resolve(ws));
    ws.on('error', (e) => reject(e));
  });
}

async function connect(hostID: string) {
  const url = await getConnectionURL(hostID);
  return createWebSocket(url);
}

export async function hosts() {
  const response = await apiFetch('1/user/-/developer-relay/hosts.json').then(
    decodeJSON(HostsResponse),
  );

  return response.hosts.map((host) => ({
    available: host.state === 'available',
    connect: () => connect(host.id),
    displayName: host.displayName,
    roles: host.roles,
  }));
}
