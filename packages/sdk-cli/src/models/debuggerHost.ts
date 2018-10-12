import { Host } from '@fitbit/fdb-host';
import { FDBTypes } from '@fitbit/fdb-protocol';

import WebSocket from 'ws';
import websocketStream from 'websocket-stream';

import * as auth from '../auth';
import environment from '../auth/environment';

export interface HostDescriptor {
  id: string;
  displayName: string;
  capabilities: FDBTypes.ApplicationHostCapabilities;
}

function eventPromise<T>(socket: WebSocket, eventName: string) {
  return new Promise<T>(resolve => socket.once(eventName, resolve));
}

async function createHostConnection({ id, displayName, capabilities }: HostDescriptor) {
  const roles: string[] = [];
  if (capabilities.install) {
    if (capabilities.install.appBundle) roles.push('APP_HOST');
    if (capabilities.install.companionBundle) roles.push('COMPANION_HOST');
  }

  const authToken = await auth.getAccessToken();
  return new WebSocket(environment().config.devRelayUrl, {
    headers: {
      Authorization: `Bearer ${authToken!}`,
      'X-Relay-Host-Roles': roles.join(','),
      'X-Relay-Host-ID': id,
      'X-Relay-Host-Display-Name': displayName,
    },
  });
}

export async function createDebuggerHost(
  hostDescriptor: HostDescriptor,
  handleLog: (msg: string) => void,
) {
  const socket = await createHostConnection(hostDescriptor);
  handleLog('Connected to developer relay, waiting for debugger');

  const initMessageBuffer = await eventPromise<WebSocket.Data>(socket, 'message');
  const initMessage = JSON.parse(initMessageBuffer.toString());

  handleLog('Debugger connected');
  const host = Host.create(
    websocketStream(
      socket,
      {
        binary: false,
        objectMode: true,
      },
    ),
    {
      maxMessageSize: initMessage.maxMessageSize,
      device: hostDescriptor.displayName,
      // I don't see anywhere that we actually care what this is defined as
      hostKind: 'device',
    },
  );

  const closePromise = eventPromise(socket, 'close').then(() => {
    handleLog('Debugger or relay closed connection');
  });

  return {
    closePromise,
    host,
    handleClose: () => socket.close(),
  };
}
