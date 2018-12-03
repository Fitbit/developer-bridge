import * as t from 'io-ts';
import { decode } from '@fitbit/jsonrpc-ts';
import stream from 'stream';
import websocketStream from 'websocket-stream';

import { apiFetch } from './baseAPI';
import { assertContentType, assertOK, assertJSON, decodeJSON } from '../util/fetchUtil';

// tslint:disable-next-line:variable-name
export const Host = t.type(
  {
    id: t.string,
    displayName: t.string,
    roles: t.array(t.string),
    state: t.union([
      t.literal('available'),
      t.literal('busy'),
    ]),
  },
  'Host',
);
export type Host = t.TypeOf<typeof Host>;

// tslint:disable-next-line:variable-name
const HostsResponse = t.type(
  {
    hosts: t.array(Host),
  },
  'HostsResponse',
);

// tslint:disable-next-line:variable-name
const Hosts403Response = t.type(
  {
    errors: t.array(t.type({
      message: t.string,
    })),
  },
  'Hosts403Response',
);
type Hosts403Response = t.TypeOf<typeof Hosts403Response>;

async function getConnectionURL(hostID: string) {
  const response = await apiFetch(
    `1/user/-/developer-relay/hosts/${hostID}`,
    { method: 'POST' },
  ).then(assertOK).then(assertContentType('text/uri-list'));
  const uriList = (await response.text())
    .split('\r\n')
    .filter(line => line[0] !== '#');
  return uriList[0];
}

function createWebSocket(uri: string) {
  return new Promise<stream.Duplex>((resolve, reject) => {
    const ws = websocketStream(uri, { objectMode: true });
    ws.on('connect', () => resolve(ws));
    ws.on('error', e => reject(e));
  });
}

export async function connect(hostID: string) {
  const url = await getConnectionURL(hostID);
  return createWebSocket(url);
}

export async function hosts() {
  const response = await apiFetch('1/user/-/developer-relay/hosts.json')
    .then(async (response: Response) => {
      if (response.ok || response.status !== 403) return response;

      const errorObj = await assertJSON()(response).then(decode(Hosts403Response));
      const errorString = errorObj.errors.join('\n');
      throw new Error(errorString);
    })
    .then(decodeJSON(HostsResponse));

  const hostsWithRole = (role: string) =>
    response.hosts.filter(host => host.roles.includes(role));

  return {
    appHost: hostsWithRole('APP_HOST'),
    companionHost: hostsWithRole('COMPANION_HOST'),
  };
}
