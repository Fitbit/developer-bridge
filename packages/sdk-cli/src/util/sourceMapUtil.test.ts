import { ConsoleMessage, ConsoleTrace } from '@fitbit/fdb-debugger';
import { SourceMapConsumer, SourceMapGenerator } from 'source-map';

import {
  appURItoPOSIXPath,
  SourceMapConsumers,
  sourceMapMessage,
  transformPosition,
} from './sourceMapUtil';

const original = {
  source: 'input.js',
  line: 100,
  column: 50,
  name: 'inputFunc',
};

const generated = {
  source: 'output.js',
  line: 10,
  column: 5,
  name: 'outputFunc',
};

let sourceMapConsumers: SourceMapConsumers;

beforeEach(async () => {
  const sourceMap = new SourceMapGenerator({
    file: generated.source,
  });
  sourceMap.addMapping({
    source: original.source,
    // Line numbers +1 because source-map is line 1-indexed
    original: { line: original.line + 1, column: original.column },
    generated: { line: generated.line + 1, column: generated.column },
    name: original.name,
  });

  sourceMapConsumers = {
    [generated.source]: await new SourceMapConsumer(sourceMap.toString()),
  };
});

describe('appURItoPOSIXPath()', () => {
  it.each([
    ['resolves a relative path', 'app://foo.js', 'foo.js'],
    ['resolves a relative path containing a period', 'app://./foo.js', 'foo.js'],
    ['resolves a relative path that traverses upwards', 'app://bar/../foo.js', 'foo.js'],
    ['resolves an absolute path', 'app:///foo.js', 'foo.js'],
    ['resolves an absolute path with more than one level', 'app:///bar/foo.js', 'bar/foo.js'],
  ])('%s', (testName, appUri, expectedPath) => {
    expect(appURItoPOSIXPath(appUri)).toEqual(expectedPath);
  });
});

describe('transformPosition()', () => {
  it('normalizes the source field', () => {
    expect(transformPosition(
      { source: 'app://foo.js', line: 10, column: 5 },
      sourceMapConsumers,
    )).toEqual(expect.objectContaining({
      source: 'foo.js',
    }));
  });

  it('transforms source position using a sourcemap', () => {
    expect(transformPosition(generated, sourceMapConsumers))
      .toEqual(expect.objectContaining(original));
  });

  it('does not transform positions with no matching sourcemap entry', () => {
    const position = {
      ...generated,
      source: 'bad.js',
    };

    expect(transformPosition(position, sourceMapConsumers)).toEqual(position);
  });

  it('does not transform position if it is generated', () => {
    const position = {
      ...generated,
      generated: true,
    };

    expect(transformPosition(position, sourceMapConsumers)).toEqual(position);
  });

  it('does not transform position if no sourceMapConsumers are available', () => {
    expect(transformPosition(generated)).toEqual(generated);
  });

  it('does not transform position if the line on the mapped position does not exists', () => {
    const positionSpy = jest.spyOn(sourceMapConsumers[generated.source], 'originalPositionFor');
    positionSpy.mockReturnValueOnce({
      source: 'input.js',
      line: null,
      column: 5,
    });

    expect(transformPosition(generated, sourceMapConsumers)).toEqual(generated);
  });

  it('does not transform position if the column on the mapped position does not exists', () => {
    const positionSpy = jest.spyOn(sourceMapConsumers[generated.source], 'originalPositionFor');
    positionSpy.mockReturnValueOnce({
      source: 'input.js',
      line: 10,
      column: null,
    });

    expect(transformPosition(generated, sourceMapConsumers)).toEqual(generated);
  });

  it('uses the generated position name if mapped position name does not exist', () => {
    const positionSpy = jest.spyOn(sourceMapConsumers[generated.source], 'originalPositionFor');
    positionSpy.mockReturnValueOnce({
      source: original.source,
      line: original.line + 1,
      column: original.column,
      name: null,
    });

    expect(transformPosition(generated, sourceMapConsumers)).toEqual({
      ...original,
      name: generated.name,
    });
  });
});

describe('sourceMapMessage()', () => {
  const mockMessage: ConsoleMessage = {
    emittedBy: {
      uuid: 'fakeUUID',
      buildID: 'fakeBuildID',
      component: 'app',
    },
    position: generated,
    kind: 'log',
    message: ['Test Message'],
  };

  it('transforms the message position', () => {
    const componentSourceMapConsumers = {
      app: sourceMapConsumers,
    };

    expect(sourceMapMessage(mockMessage, componentSourceMapConsumers).position)
      .toEqual(expect.objectContaining(original));
  });

  it('transforms the stack positions of a trace message', async () => {
    const original = { source: 'input.js', line: 100, column: 50, name: 'logFunc' };
    const original2 = { source: 'input.js', line: 200, column: 20 };
    const generated = { source: 'output.js', line: 10, column: 5, name: 'outputFunc' };
    const generated2 = { source: 'output.js', line: 20, column: 2 };

    const sourceMap = new SourceMapGenerator({
      file: generated.source,
    });

    sourceMap.addMapping({
      source: original.source,
      // Line numbers +1 because source-map is line 1-indexed
      original: { line: original.line + 1, column: original.column },
      generated: { line: generated.line + 1, column: generated.column },
      name: original.name,
    });

    sourceMap.addMapping({
      source: original2.source,
      // Line numbers +1 because source-map is line 1-indexed
      original: { line: original2.line + 1, column: original2.column },
      generated: { line: generated2.line + 1, column: generated2.column },
    });

    const traceSourceMapConsumers = {
      app: { [generated.source]: await new SourceMapConsumer(sourceMap.toString()) },
    };

    const mockTrace = {
      ...mockMessage,
      position: undefined,
      kind: 'trace',
      stack: [generated, generated2],
    };

    expect(sourceMapMessage(mockTrace as ConsoleTrace, traceSourceMapConsumers).stack)
      .toEqual([original, original2]);
  });
});
