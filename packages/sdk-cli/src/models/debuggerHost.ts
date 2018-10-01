import { Host, InstallOptions } from '@fitbit/fdb-host';
import jszip from 'jszip';
import lodash from 'lodash';
import WebSocket from 'ws';
import websocketStream from 'websocket-stream';

import * as auth from '../auth';
import environment from '../auth/environment';

export type HostType = 'app' | 'companion';
type HostKind = 'device' | 'companion';

async function getBundleInfo(bundleData: Buffer) {
  const bundleZip = await jszip.loadAsync(bundleData);
  const manifestStr = await bundleZip.file('manifest.json').async('text');
  const manifest = JSON.parse(manifestStr);
  return {
    uuid: manifest.uuid,
    buildID: manifest.buildId.slice(2),
  };
}

function makeHostCapabilities(
  hostType: HostType,
  hostProperties: {
    maxAPIVersion?: string,
  },
): InstallOptions {
  const { maxAPIVersion } = hostProperties;
  const capabilities = {
    app: {
      appBundle: true,
      appCompatibility: [
        {
          maxAPIVersion,
          family: 'Higgs',
          version: '277.255.1.999',
        },
      ],
    },
    companion: {
      companionBundle: true,
      ...(maxAPIVersion && { companionCompatibility: { maxAPIVersion } }),
    },
  };
  return capabilities[hostType];
}

function makeHostInfo(hostType: HostType) {
  return {
    device: `Mock ${lodash.startCase(hostType)} Host`,
    hostKind: {
      app: 'device',
      companion: 'companion',
    }[hostType] as HostKind,
  };
}

function eventPromise<T>(socket: WebSocket, eventName: string) {
  return new Promise<T>(resolve => socket.once(eventName, resolve));
}

export async function createHostConnection(hostType: HostType) {
  const authToken = await auth.getAccessToken();
  return new WebSocket(environment().config.devRelayUrl, {
    headers: {
      Authorization: `Bearer ${authToken!}`,
      'X-Relay-Host-Roles': `${hostType.toUpperCase()}_HOST`,
      'X-Relay-Host-ID': `mock_${hostType}`,
      'X-Relay-Host-Display-Name': `Mock ${lodash.startCase(hostType)} Host`,
    },
  });
}

export async function createDebuggerHost(
  socket: WebSocket,
  hostType: HostType,
  handleLog: (msg: string) => void,
  hostProperties: {
    maxAPIVersion?: string,
  },
) {
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
      ...makeHostInfo(hostType),
    },
  );
  host.setInstallHandler(
    async (bundleData) => {
      const bundleInfo = await getBundleInfo(bundleData);
      handleLog(
        `Sideload received with appID:${bundleInfo.uuid} buildID:${bundleInfo.buildID}`,
      );
      return {
        app: bundleInfo,
        components: [hostType],
      };
    },
    makeHostCapabilities(hostType, hostProperties),
  );

  await eventPromise(socket, 'close');
  handleLog('Debugger or relay closed connection');
}
