import path from 'path';

import { SourceMapConsumer } from 'source-map';

import { ConsoleMessage, ConsoleTrace } from '@fitbit/fdb-debugger';
import { FDBTypes } from '@fitbit/fdb-protocol';

export interface SourceMapConsumers {
  [source: string]: SourceMapConsumer;
}

export interface ComponentSourceMapConsumers {
  app?: SourceMapConsumers;
  companion?: SourceMapConsumers;
  settings?: SourceMapConsumers;
}

type LogMessage = ConsoleMessage | ConsoleTrace;

export function appURItoPOSIXPath(uri: string) {
  // Strip the app scheme prefix and leading slash
  const normalized = path.posix.normalize(uri.replace('app://', ''));
  return normalized[0] === '/' ? normalized.substring(1) : normalized;
}

export function transformPosition(position: FDBTypes.Position, sourceMaps?: SourceMapConsumers) {
  position.source = appURItoPOSIXPath(position.source);

  if (position.generated || !sourceMaps) return position;

  const sourceMapConsumer = sourceMaps[position.source];
  if (!sourceMapConsumer) return position;

  // SourceMapConsumer line numbers are one based and columns zero based.
  const mappedPosition = sourceMapConsumer.originalPositionFor({
    line: position.line + 1,
    column: position.column,
  });

  if (mappedPosition.line === null || mappedPosition.column === null) return position;

  // SourceMapConsumer line numbers are one based, we expect zero based internally.
  mappedPosition.line -= 1;

  return {
    line: mappedPosition.line,
    column: mappedPosition.column,
    name: mappedPosition.name || position.name,
    source: mappedPosition.source || position.source,
  };
}

export function sourceMapMessage(
  message: ConsoleMessage,
  sourceMaps: ComponentSourceMapConsumers,
): ConsoleMessage;

export function sourceMapMessage(
  message: ConsoleTrace,
  sourceMaps: ComponentSourceMapConsumers,
): ConsoleTrace;

export function sourceMapMessage(
  message: LogMessage,
  sourceMaps: ComponentSourceMapConsumers,
): LogMessage {
  if ('position' in message && message.position) {
    message.position = transformPosition(
      message.position,
      sourceMaps[message.emittedBy.component],
    );
  }

  if ('stack' in message) {
    message.stack = message.stack.map((position) => {
      return transformPosition(position, sourceMaps[message.emittedBy.component]);
    });
  }

  return message;
}
