import chalk from 'chalk';
import vorpal from '@moleculer/vorpal';

import {
  addSourcePadding,
  formatMessage,
  createPrefixedLog,
} from './formatMessage';

jest.mock('@moleculer/vorpal');

type ComponentType = 'app' | 'companion' | 'settings';
type MessageKind = 'log' | 'info' | 'warn' | 'error';
type TraceKind = 'trace' | 'assert' | 'exception';

const timestamp = new Date(Date.UTC(2018, 5, 27, 0, 0, 0));

const mockMessage = {
  timestamp,
  emittedBy: {
    uuid: 'fakeUUID',
    buildID: 'fakeBuildID',
    component: 'app' as ComponentType,
  },
  position: {
    source: 'app/index.js',
    line: 10,
    column: 5,
  },
  kind: 'log' as MessageKind,
  message: ['Test Message'],
};

const sourcePosition = '(app/index.js:11,6)';
const messageTimestamp = mockMessage.timestamp.toLocaleTimeString();
const prefixedLog = `[${messageTimestamp}]       App: Test Message`;
const screenWidth = (process.stdout.columns = 100);

describe('createPrefixedLog', () => {
  it('adds a log prefix and and formats the log', () => {
    expect(createPrefixedLog(mockMessage)).toEqual(prefixedLog);
  });

  it('formats messages with multiple arguments', () => {
    expect(
      createPrefixedLog({ ...mockMessage, message: ['string:%d', 5] }),
    ).toEqual(`[${messageTimestamp}]       App: string:5`);
  });

  it('supports messages without timestamps', () => {
    expect(createPrefixedLog({ ...mockMessage, timestamp: undefined })).toEqual(
      '      App: Test Message',
    );
  });

  it('does not break when given an empty message', () => {
    expect(createPrefixedLog({ ...mockMessage, message: [] })).toEqual(
      `[${messageTimestamp}]       App: `,
    );
  });
});

describe('addSourcePadding()', () => {
  function calculatePadding(logLength: number) {
    const padding = screenWidth - logLength - sourcePosition.length;
    return ' '.repeat(padding < 0 ? 0 : padding);
  }

  function expectPaddedString(logString: string, padding: string) {
    const expectedString = `${logString}${padding}${sourcePosition}`;
    return expect(addSourcePadding(logString, sourcePosition)).toEqual(
      expectedString,
    );
  }

  it('adds the correct amount of padding', () => {
    const logString = 'someString';
    const padding = calculatePadding(logString.length);
    expectPaddedString(logString, padding);
  });

  it('adds the correct amount of padding for empty logs', () => {
    const padding = calculatePadding(0);
    expectPaddedString('', padding);
  });

  it('adds the correct amount of padding for logs longer than the terminal width', () => {
    const overflowChars = 10;
    const logString = 'a'.repeat(screenWidth + overflowChars);
    const padding = calculatePadding(overflowChars);
    expectPaddedString(logString, padding);
  });

  it('adds the correct amount of padding for logs that contain newline chars', () => {
    const stringOnNewLine = 'newLineString';
    const logString = `someString\n${stringOnNewLine}`;
    const padding = calculatePadding(stringOnNewLine.length);
    expectPaddedString(logString, padding);
  });

  it('adds no padding when the terminal width is not defined', () => {
    (process.stdout.columns as any) = undefined;
    expectPaddedString('someString', '');
  });
});

describe('formatMessage', () => {
  const mockVorpal = new vorpal();

  describe('consoleMessage', () => {
    it('formats and outputs a log', () => {
      formatMessage(mockVorpal, mockMessage);
      expect(mockVorpal.log).toBeCalledWith(
        addSourcePadding(prefixedLog, sourcePosition),
      );
    });

    it('outputs warning logs', () => {
      const warnMessage = { ...mockMessage, kind: 'warn' as MessageKind };

      formatMessage(mockVorpal, warnMessage);
      expect(mockVorpal.log).toBeCalledWith(
        chalk.keyword('orange')(addSourcePadding(prefixedLog, sourcePosition)),
      );
    });

    it('outputs error logs', () => {
      const errorMessage = { ...mockMessage, kind: 'error' as MessageKind };

      formatMessage(mockVorpal, errorMessage);
      expect(mockVorpal.log).toBeCalledWith(
        chalk.red(addSourcePadding(prefixedLog, sourcePosition)),
      );
    });

    it('outputs a log without a position', () => {
      const newMessage = { ...mockMessage, position: undefined };

      formatMessage(mockVorpal, newMessage);
      expect(mockVorpal.log).toBeCalledWith(prefixedLog);
    });
  });

  describe('consoleTrace', () => {
    const mockTrace = {
      ...mockMessage,
      kind: 'trace' as TraceKind,
      position: undefined,
      stack: [
        {
          source: 'app/index.js',
          line: 10,
          column: 5,
          name: 'logFunc',
        },
        {
          source: 'app/index.js',
          line: 20,
          column: 2,
        },
      ],
    };

    const stackTrace =
      '\n  logFunc at app/index.js:11,6\n  ? at app/index.js:21,3';
    const expectedMessage = `[${messageTimestamp}]       App: Test Message${stackTrace}`;

    it('outputs a trace message', () => {
      formatMessage(mockVorpal, mockTrace);
      expect(mockVorpal.log).toBeCalledWith(expectedMessage);
    });

    it('outputs an exception trace message', () => {
      const exceptionTrace = {
        ...mockTrace,
        kind: 'exception' as TraceKind,
      };

      formatMessage(mockVorpal, exceptionTrace);
      expect(mockVorpal.log).toBeCalledWith(chalk.red(expectedMessage));
    });

    it('outputs an assert message', () => {
      const assertTrace = {
        ...mockTrace,
        kind: 'assert' as TraceKind,
      };

      formatMessage(mockVorpal, assertTrace);
      expect(mockVorpal.log).toBeCalledWith(chalk.red(expectedMessage));
    });
  });
});
