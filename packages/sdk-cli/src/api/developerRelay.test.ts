import nock from 'nock';
import stream from 'stream';
import websocketStream from 'websocket-stream';

import * as auth from '../auth';
import environment from '../auth/environment';
import * as developerRelay from './developerRelay';
import mockWithPromiseWaiter from '../testUtils/mockWithPromiseWaiter';

jest.mock('websocket-stream', () => jest.fn());
jest.mock('../auth');

const mockHostID = 'fakeHost';

const mockAppHost = {
  id: 'apphostA',
  displayName: 'App Host',
  roles: ['APP_HOST'],
  state: 'available',
};

const mockCompanionHost = {
  id: 'companionhostA',
  displayName: 'Companion Host',
  roles: ['COMPANION_HOST'],
  state: 'available',
};

let endpointMock: nock.Scope;

function mockHostsResponse(status: number, payload?: any) {
  endpointMock
    .get('/1/user/-/developer-relay/hosts.json')
    .reply(status, payload);
}

function mockHostsSuccessResponse(hosts = [mockAppHost, mockCompanionHost]) {
  mockHostsResponse(200, { hosts });
}

function mockConnectionURLResponse(hostID: string, response: string) {
  endpointMock
    .post(`/1/user/-/developer-relay/hosts/${hostID}`)
    .reply(
      200,
      response,
      { 'Content-Type': 'text/uri-list' },
    );
}

beforeEach(() => {
  (auth.getAccessToken as jest.Mock).mockResolvedValueOnce('mockToken');
  endpointMock = nock(environment().config.apiUrl);
});

describe('hosts()', () => {
  it('returns list of connected app hosts', async () => {
    mockHostsSuccessResponse();
    return expect(developerRelay.hosts()).resolves.toEqual(expect.objectContaining({
      appHost: [mockAppHost],
    }));
  });

  it('returns list of connected companion hosts', async () => {
    mockHostsSuccessResponse();
    return expect(developerRelay.hosts()).resolves.toEqual(expect.objectContaining({
      companionHost: [mockCompanionHost],
    }));
  });

  it('returns empty lists if no hosts are connected', async () => {
    mockHostsSuccessResponse([]);
    return expect(developerRelay.hosts()).resolves.toEqual({
      appHost: [],
      companionHost: [],
    });
  });

  it('ignores hosts with unknown roles', async () => {
    mockHostsSuccessResponse([
      {
        ...mockAppHost,
        roles: ['__bad_role__'],
      },
    ]);
    return expect(developerRelay.hosts()).resolves.toEqual({
      appHost: [],
      companionHost: [],
    });
  });

  it('parses a 403 response for error reasons', async () => {
    mockHostsResponse(403, { errors: [{ message: 'reason 1' }, { message: 'reason 2' }] });
    return expect(developerRelay.hosts()).rejects.toEqual(new Error('reason 1\nreason 2'));
  });

  it('handles a 403 response with a malformed payload', async () => {
    mockHostsResponse(403, { message: 'reason 2' });
    return expect(developerRelay.hosts()).rejects.toMatchSnapshot();
  });

  it('handles a 403 response with a non JSON payload', async () => {
    mockHostsResponse(403);
    return expect(developerRelay.hosts()).rejects.toMatchSnapshot();
  });

  it('handles a non 403 error response', async () => {
    mockHostsResponse(500);
    return expect(developerRelay.hosts()).rejects.toMatchSnapshot();
  });
});

describe('connect()', () => {
  const mockConnectionURL = 'ws://device_url';
  let mockWebSocket: stream.Duplex;
  let socketPromise: Promise<void>;
  let connectPromise: Promise<stream.Duplex>;

  beforeEach(async () => {
    mockWebSocket = new stream.Duplex();
    socketPromise = mockWithPromiseWaiter(websocketStream as any, mockWebSocket);
    mockConnectionURLResponse(mockHostID, `${mockConnectionURL}\r\n`);
    connectPromise = developerRelay.connect(mockHostID);
    await socketPromise;
  });

  describe('when the WebSocket connection is successful', () => {
    beforeEach(() => mockWebSocket.emit('connect'));
    afterEach(() => connectPromise);

    it('opens a websocket connection to the retrieved URL', () => {
      expect(websocketStream).toBeCalledWith(
        mockConnectionURL,
        { objectMode: true },
      );
    });

    it('returns a stream', () =>
      expect(connectPromise).resolves.toBe(mockWebSocket));

  });

  describe('when the WebSocket connection is unsucessful', () => {
    beforeEach(() => mockWebSocket.emit('error', new Error('Connection failed!')));

    it('throws', () => expect(connectPromise).rejects.toThrowErrorMatchingSnapshot());
  });
});
