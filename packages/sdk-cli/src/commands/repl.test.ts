import vorpal from 'vorpal';

import repl from './repl';
import HostConnections from '../models/HostConnections';
import commandTestHarness from '../testUtils/commandTestHarness';

let cli: vorpal;
let mockLog: jest.Mock;
let hostConnections: HostConnections;

beforeEach(() => {
  hostConnections = new HostConnections();
  ({ cli, mockLog } = commandTestHarness(repl({ hostConnections })));
});

const run = () => cli.exec('repl device');
const cliMode = () => (cli.session as any)._mode;

const mockHost = ({ hasEvalSupport }: { hasEvalSupport: boolean }) => {
  hostConnections.appHost = {
    host: {
      eval: jest.fn(),
      hasEvalSupport: () => hasEvalSupport,
      rpc: {
        ended: false,
      },
    },
  } as any;
};
const mockEval = () => hostConnections.appHost!.host.eval as jest.Mock;

describe('no device is connected', () => {
  beforeEach(run);

  it('logs an error', () => {
    expect(mockLog.mock.calls[0][0]).toMatchSnapshot();
  });

  it('exits REPL mode', () => {
    expect(cliMode()).toEqual(false);
  });
});

describe('connected device not support REPL', () => {
  beforeEach(() => {
    mockHost({ hasEvalSupport: false });
    return run();
  });

  it('logs an error', () => {
    expect(mockLog.mock.calls[0][0]).toMatchSnapshot();
  });

  it('exits REPL mode', () => {
    expect(cliMode()).toEqual(false);
  });
});

describe('connected device supports REPL', () => {
  beforeEach(() => {
    mockHost({ hasEvalSupport: true });
    return run();
  });

  it('logs an informational message explaining how to exit', () => {
    expect(mockLog.mock.calls[0][0]).toMatchSnapshot();
  });

  it('enters REPL mode', () => {
    expect(cliMode()).not.toEqual(false);
  });

  describe('executing a statement', () => {
    beforeEach(() => mockLog.mockClear());

    it('sends the statement to the device', async () => {
      await cli.exec('console');
      expect(hostConnections.appHost!.host.eval).toBeCalledWith('console');
    });

    it('logs the result on success', async () => {
      const expectedResult = 'is a function';
      mockEval().mockResolvedValueOnce({
        success: true,
        value: expectedResult,
      });
      await cli.exec('console');
      expect(mockLog).toBeCalledWith(expectedResult);
    });

    it('does not log any result on failure', async () => {
      mockEval().mockResolvedValueOnce({
        success: false,
      });
      await cli.exec('console');
      expect(mockLog).not.toBeCalled();
    });

    it('logs if an error occurs during eval', async () => {
      mockEval().mockRejectedValueOnce(
        new Error('something went wrong :('),
      );
      await cli.exec('console');
      expect(mockLog.mock.calls[0][0]).toMatchSnapshot();
    });

    describe('host disconnected since entering REPL', () => {
      beforeEach(() => {
        hostConnections.appHost!.host.rpc.ended = true;
        return cli.exec('console');
      });

      it('logs an error', () => expect(mockLog.mock.calls[0][0]).toMatchSnapshot());
      it('exits the REPL', () => expect(cliMode()).toEqual(false));
    });
  });
});
