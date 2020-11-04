import util from 'util';

import chalk, { Chalk } from 'chalk';
import lodash from 'lodash';
import vorpal from '@moleculer/vorpal';

import { ConsoleMessage, ConsoleTrace } from '@fitbit/fdb-debugger';
import { FDBTypes } from '@fitbit/fdb-protocol';

const consoleColors: { [kind: string]: Chalk } = {
  warn: chalk.keyword('orange'),
  error: chalk.red,
  exception: chalk.red,
  assert: chalk.red,
};

const maxComponentNameLength = Math.max(
  ...Object.values(FDBTypes.Component).map(
    (componentType: string) => componentType.length,
  ),
);

function isConsoleTrace(
  message: ConsoleMessage | ConsoleTrace,
): message is ConsoleTrace {
  return (<ConsoleTrace>message).stack !== undefined;
}

export function createPrefixedLog(message: ConsoleMessage | ConsoleTrace) {
  const component = lodash.padStart(
    lodash.upperFirst(message.emittedBy.component),
    maxComponentNameLength,
  );
  const timestamp = message.timestamp
    ? `[${message.timestamp.toLocaleTimeString()}] `
    : '';

  // Type for util.format expects at least 1 argument and complains when message is spread
  // When called with no args returns an empty string so opt out of util.formats type
  const formattedMessage = (util.format as any)(...message.message);

  return `${timestamp}${component}: ${formattedMessage}`;
}

export function addSourcePadding(log: string, sourcePosition: string) {
  const terminalWidth = process.stdout.columns || 0;
  const lastLogLine = log.split(/\r?\n/).slice(-1)[0] || '';
  const messageLength = lastLogLine.length + sourcePosition.length;

  let padding: number;
  if (messageLength > terminalWidth) {
    padding = terminalWidth - (messageLength % terminalWidth || 0);
  } else {
    padding = terminalWidth - messageLength;
  }
  padding += sourcePosition.length;

  return `${log}${sourcePosition.padStart(padding)}`;
}

function formatConsoleMessage(cli: vorpal, message: ConsoleMessage) {
  const colorizer = consoleColors[message.kind] || chalk;
  let sourcePosition = '';
  let log = createPrefixedLog(message);

  if (message.position) {
    const position = message.position;
    sourcePosition = `(${position.source}:${position.line + 1},${
      position.column + 1
    })`;
    log = addSourcePadding(log, sourcePosition);
  }

  cli.log(colorizer(log));
}

function formatConsoleTrace(cli: vorpal, message: ConsoleTrace) {
  const frameIndent = '\n  ';
  const colorizer = consoleColors[message.kind] || chalk;

  const log = createPrefixedLog(message);

  const stackMessage = message.stack
    .map((frame) => {
      return `${frame.name || '?'} at ${frame.source}:${frame.line + 1},${
        frame.column + 1
      }`;
    })
    .join(frameIndent);

  cli.log(colorizer(`${log}${frameIndent}${stackMessage}`));
}

export function formatMessage(
  cli: vorpal,
  message: ConsoleMessage | ConsoleTrace,
) {
  if (isConsoleTrace(message)) return formatConsoleTrace(cli, message);
  formatConsoleMessage(cli, message);
}
