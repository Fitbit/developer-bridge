import * as net from 'net';
import * as websocket from 'websocket';
import * as nock from 'nock';
import supertest from 'supertest';

import Host from './Host';
import HostStore from './HostStore';
import RelayServer from './RelayServer';

let server: RelayServer;
let httpRequest: supertest.SuperTest<supertest.Test>;
let wsUrl: string;
let wsTestConnection: websocket.connection;

beforeAll(() => {
  server = new RelayServer();
  const port = server.listen();

  httpRequest = supertest(server.httpServer);
  wsUrl = `ws://127.0.0.1:${port}`;
});

afterEach(() => {
  wsTestConnection?.close();
});

afterAll(() => {
  server.close();
  nock.cleanAll();
});

describe('port', () => {
  it('returns the http server port', () => {
    expect(server.port).toBe(
      (server.httpServer.address() as net.AddressInfo).port,
    );
  });
});

describe('auth', () => {
  it('rejects if both host and client auth attempted', () =>
    expectWsError(
      wsConnection(wsUrl, {
        ...hostConnectionRequestHeaders({
          hostId: 'a',
          displayName: 'b',
          roles: 'c',
        }),
        ...clientConnectionRequestHeaders({ peerHostId: 'd' }),
      }),
      400,
      'Ambiguous connection, both authenticated and connection token provided',
    ));

  it('rejects if neither host nor client auth attempted', () =>
    expectWsError(
      wsConnection(wsUrl),
      401,
      'Unrecognized connection type, neither authenticated nor connection token provided',
    ));

  describe('host connection', () => {
    it("adds host, which connects on 'requestAccepted' event", async () => {
      expect(server['hostStore'].listAll()).toEqual([]);

      const hostPayload = {
        hostId: 'test host id',
        displayName: 'test display name',
        // TODO: add tests for wrong roles header
        roles: 'a,B,    C    , g00_gle',
      };

      const newHost: Host = await addHostRequest(hostPayload);

      expect(newHost).toEqual(
        expect.objectContaining({
          _id: hostPayload.hostId,
          _displayName: hostPayload.displayName,
          _roles: ['A', 'B', 'C', 'G00_GLE'],
          connection: expect.objectContaining({
            masterPeer: expect.any(websocket.connection),
          }),
        }),
      );

      expect(newHost.canConnectPeer()).toBe(true);
    });
  });

  describe('client connection', () => {
    beforeEach(() => {
      server['hostStore'].clearAll();
    });

    it('connects client to host', async () => {
      const hostId = 'a';
      const host: Host = await addHostRequest({
        hostId,
        displayName: 'a',
        roles: '',
      });

      const connectPeerSpy = jest.spyOn(host, 'connectPeer');

      await connectClientToHostRequest({ peerHostId: hostId });

      expect(connectPeerSpy).toBeCalledWith(expect.any(websocket.connection));
      expect(host.canConnectPeer()).toBe(false);
    });

    it("rejects if requested host doesn't exist", () =>
      expectWsError(
        connectClientToHostRequest({ peerHostId: 'non existent' }),
        404,
        'Invalid or expired connection token',
      ));

    it('rejects if requested host is not connected', async () => {
      const hostId = 'a';
      const host: Host = await addHostRequest({
        hostId,
        displayName: 'a',
        roles: '',
      });
      jest.spyOn(host, 'isConnected').mockReturnValueOnce(false);

      await expectWsError(
        connectClientToHostRequest({ peerHostId: hostId }),
        500,
        `Host ${hostId} is not connected`,
      );
    });

    it('rejects if requested host is already connected to a client', async () => {
      const hostId = 'a';
      const host: Host = await addHostRequest({
        hostId,
        displayName: 'a',
        roles: '',
      });
      jest.spyOn(host, 'canConnectPeer').mockReturnValueOnce(false);

      await expectWsError(
        connectClientToHostRequest({ peerHostId: hostId }),
        403,
        `Host ${hostId} is already connected to a peer`,
      );
    });
  });
});

function hostConnectionRequestHeaders({
  hostId,
  displayName,
  roles,
}: {
  hostId: string;
  displayName: string;
  roles: string;
}) {
  return {
    'x-relay-host-id': hostId,
    'x-relay-host-display-name': displayName,
    'x-relay-host-roles': roles,
  };
}

function clientConnectionRequestHeaders({
  peerHostId,
}: {
  peerHostId: string;
}) {
  return {
    'x-relay-resource': `/${peerHostId}`,
  };
}

function connectClientToHostRequest(payload: {
  peerHostId: string;
}): Promise<websocket.connection> {
  return wsConnection(wsUrl, clientConnectionRequestHeaders(payload));
}

async function addHostRequest(hostPayload: {
  hostId: string;
  displayName: string;
  roles: string;
}) {
  const hostStore: HostStore = server['hostStore'];

  wsTestConnection = await wsConnection(
    wsUrl,
    hostConnectionRequestHeaders(hostPayload),
  );

  const allHosts: Host[] = hostStore.listAll();
  // The most recently added host should be the last one, Maps preserve insertion order.
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
  return allHosts[allHosts.length - 1];
}

function wsConnection(
  url: string,
  headers?: {},
): Promise<websocket.connection> {
  return new Promise((resolve, reject) => {
    const client = new websocket.client();
    client.connect(url, undefined, undefined, headers);
    client.once('connect', resolve);
    client.once('connectFailed', reject);
  });
}

async function expectWsError(
  wsRequest: Promise<websocket.connection>,
  statusCode: number,
  expectedReason?: string,
) {
  try {
    await wsRequest;
    throw new Error('Expected the ws request to fail');
  } catch (error) {
    const [statusLine, _, ...headerLines] = (error as Error).message.split(
      '\n',
    );

    expect(statusLine).toMatch(
      `Server responded with a non-101 status: ${statusCode}`,
    );

    if (expectedReason) {
      const [__, rejectReason] = headerLines
        .map((l: string) => l.split(':'))
        .find(([header]) => header === 'x-websocket-reject-reason') as string[];

      expect(rejectReason).toMatch(expectedReason);
    }
  }
}
