import { EventEmitter } from 'events';

import { RemoteHost } from '@fitbit/fdb-debugger';
import { SourceMapConsumer } from 'source-map';

import AppContext from './AppContext';
import * as compatibility from './compatibility';
import HostConnections from './HostConnections';
import LogConsumer from './LogConsumer';
import { SourceMapConsumers } from '../util/sourceMapUtil';

jest.mock('./compatibility');

type ComponentType = 'app' | 'companion' | 'settings';
type MessageKind = 'log' | 'info' | 'warn' | 'error';

enum HostType {
  app = 'appHost',
  companion = 'companionHost',
}

const mockMessage = {
  timestamp: new Date(),
  emittedBy: {
    uuid: 'fakeUUID',
    buildID: 'fakeBuildID',
    component: 'app' as ComponentType,
  },
  position: {
    source: 'app:///./app/index.js',
    line: 10,
    column: 5,
  },
  kind: 'log' as MessageKind,
  message: ['Test Message'],
};

describe('LogConsumer', () => {
  let appContext: AppContext;
  let hostConnections: HostConnections;
  let appHost: EventEmitter;
  let companionHost: EventEmitter;
  let logConsumer: LogConsumer;
  let registerAppHostObject: { hostType: HostType; host: RemoteHost };
  const messageFormatter = jest.fn();

  beforeEach(() => {
    appContext = new AppContext();
    appContext.onAppPackageLoad.attach = jest.fn();

    hostConnections = new HostConnections();
    hostConnections.onHostAdded.attach = jest.fn();

    logConsumer = new LogConsumer({
      appContext,
      hostConnections,
      messageFormatter,
    });

    appHost = new EventEmitter();
    companionHost = new EventEmitter();
    registerAppHostObject = {
      hostType: HostType.app,
      host: appHost as RemoteHost,
    };
  });

  it('attaches registerHost to a host added event', () => {
    expect(hostConnections.onHostAdded.attach).toBeCalledWith(
      logConsumer.registerHost,
    );
  });

  it('attaches registerSourceMaps to an app package loaded event', () => {
    expect(appContext.onAppPackageLoad.attach).toBeCalledWith(
      logConsumer.registerSourceMaps,
    );
  });

  describe('registerHost()', () => {
    beforeEach(async () => {
      await logConsumer.registerHost(registerAppHostObject);
      await logConsumer.registerHost({
        hostType: HostType.companion,
        host: companionHost as RemoteHost,
      });
    });

    it('registers a consoleMessage listener on the host', () => {
      appHost.emit('consoleMessage', mockMessage);
      expect(messageFormatter).toBeCalledWith(mockMessage);
    });

    it('registers a consoleTrace listener on the host', () => {
      const traceMessage = {
        ...mockMessage,
        position: undefined,
        stack: [],
      };

      appHost.emit('consoleTrace', traceMessage);
      expect(messageFormatter).toBeCalledWith(traceMessage);
    });

    it('registers listeners for both companion and app hosts', () => {
      const companionMockMessage = {
        ...mockMessage,
        emittedBy: {
          uuid: 'fakeUUID',
          buildID: 'fakeBuildID',
          component: 'companion' as ComponentType,
        },
      };

      appHost.emit('consoleMessage', mockMessage);
      companionHost.emit('consoleMessage', companionMockMessage);

      expect(messageFormatter).toBeCalledWith(mockMessage);
      expect(messageFormatter).toBeCalledWith(companionMockMessage);
    });

    it('removes old listeners if a previous host exists', async () => {
      const newHost = new EventEmitter();
      const newCompanionHost = new EventEmitter();

      await logConsumer.registerHost({
        hostType: HostType.app,
        host: newHost as RemoteHost,
      });
      await logConsumer.registerHost({
        hostType: HostType.companion,
        host: newCompanionHost as RemoteHost,
      });

      appHost.emit('consoleMessage', mockMessage);
      companionHost.emit('consoleTrace', mockMessage);
      expect(messageFormatter).not.toBeCalled();
    });

    it('calls registersSourceMaps', async () => {
      const registerSourceMapsSpy = jest.spyOn(
        logConsumer,
        'registerSourceMaps',
      );
      await logConsumer.registerHost(registerAppHostObject);
      expect(registerSourceMapsSpy).toBeCalled();
    });
  });

  describe('registering source maps', () => {
    let sourceMapConsumers: SourceMapConsumers;
    const rawSourceMap = {
      version: 3,
      sources: ['app/index.js'],
      names: [],
      mappings: 'someMappings',
      file: 'index.js',
    };

    (compatibility.findCompatibleAppComponent as jest.Mock).mockReturnValue(
      'higgs',
    );

    beforeEach(async () => {
      const componentSourceMaps = {
        'app/index.js': rawSourceMap,
      };

      appContext.appPackage = {
        sourceMaps: {
          device: {
            higgs: componentSourceMaps,
          },
          companion: componentSourceMaps,
          settings: componentSourceMaps,
        },
      } as any;

      sourceMapConsumers = {
        'app/index.js': await new SourceMapConsumer(rawSourceMap),
      };
    });

    it('registers the all source maps on the log consumer when a host is connected', async () => {
      await logConsumer.registerHost(registerAppHostObject);

      expect(logConsumer.componentSourceMapConsumers).toEqual({
        app: sourceMapConsumers,
        companion: sourceMapConsumers,
        settings: sourceMapConsumers,
      });
    });

    it('does not register app source maps when no appHost is connected', async () => {
      await logConsumer.registerHost({
        hostType: HostType.companion,
        host: companionHost as RemoteHost,
      });

      expect(logConsumer.componentSourceMapConsumers).toEqual({
        companion: sourceMapConsumers,
        settings: sourceMapConsumers,
      });
    });

    it('overrides previously registered source maps', async () => {
      const newSourceMaps = {
        'app/source.js': rawSourceMap,
      };

      const newSourceMapConsumers = {
        'app/source.js': await new SourceMapConsumer(rawSourceMap),
      };

      await logConsumer.registerHost(registerAppHostObject);

      appContext.appPackage = {
        sourceMaps: {
          device: {
            higgs: newSourceMaps,
          },
          companion: newSourceMaps,
          settings: newSourceMaps,
        },
      } as any;

      await logConsumer.registerSourceMaps();

      expect(logConsumer.componentSourceMapConsumers).toEqual({
        app: newSourceMapConsumers,
        companion: newSourceMapConsumers,
        settings: newSourceMapConsumers,
      });
    });

    it('does not register source maps if an appPackage does not exist', async () => {
      appContext.appPackage = undefined;
      await logConsumer.registerSourceMaps();

      expect(logConsumer.componentSourceMapConsumers).toEqual({});
    });

    it('does not register source maps if source maps on appPackage do not exist', async () => {
      appContext.appPackage = {} as any;
      await logConsumer.registerSourceMaps();

      expect(logConsumer.componentSourceMapConsumers).toEqual({});
    });

    it('does not register app source maps if there is no compatible family', async () => {
      // Return value is mocked in the beforeEach reset it so we can return meson instead
      (compatibility.findCompatibleAppComponent as jest.Mock).mockReset();
      (
        compatibility.findCompatibleAppComponent as jest.Mock
      ).mockReturnValueOnce('meson');
      await logConsumer.registerHost(registerAppHostObject);

      expect(logConsumer.componentSourceMapConsumers).toEqual({
        companion: sourceMapConsumers,
        settings: sourceMapConsumers,
      });
    });

    it('registers only companion source maps if no host has connected', async () => {
      await logConsumer.registerSourceMaps();

      expect(logConsumer.componentSourceMapConsumers).toEqual({
        companion: sourceMapConsumers,
        settings: sourceMapConsumers,
      });
    });
  });
});
