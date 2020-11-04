import { ComponentSourceMaps } from '@fitbit/app-package';
import { ConsoleMessage, ConsoleTrace, RemoteHost } from '@fitbit/fdb-debugger';
import lodash from 'lodash';
import { SourceMapConsumer } from 'source-map';

import { AppPackageStore } from './AppContext';
import * as compatibility from '../models/compatibility';
import HostConnections, { HostAddedEvent } from './HostConnections';
import mapValues from '../util/mapValues';
import {
  sourceMapMessage,
  ComponentSourceMapConsumers,
} from '../util/sourceMapUtil';

interface SourceMappedComponents {
  app?: ComponentSourceMaps;
  companion?: ComponentSourceMaps;
  settings?: ComponentSourceMaps;
}

type MessageFormatterFunc = (message: ConsoleMessage | ConsoleTrace) => void;

export default class LogConsumer {
  public componentSourceMapConsumers: ComponentSourceMapConsumers = {};
  private appContext: AppPackageStore;
  private hostConnections: HostConnections;
  private messageFormatter: MessageFormatterFunc;
  private appHost?: RemoteHost;
  private companionHost?: RemoteHost;

  constructor({
    appContext,
    hostConnections,
    messageFormatter,
  }: {
    appContext: AppPackageStore;
    hostConnections: HostConnections;
    messageFormatter: MessageFormatterFunc;
  }) {
    this.appContext = appContext;
    this.appContext.onAppPackageLoad.attach(this.registerSourceMaps);

    this.hostConnections = hostConnections;
    this.hostConnections.onHostAdded.attach(this.registerHost);

    this.messageFormatter = messageFormatter;
  }

  public registerHost = ({ hostType, host }: HostAddedEvent) => {
    const currentHost = this[hostType];
    if (currentHost) {
      currentHost.removeListener('consoleMessage', this.handleLog);
      currentHost.removeListener('consoleTrace', this.handleTrace);
    }

    this[hostType] = host;
    host.on('consoleMessage', this.handleLog);
    host.on('consoleTrace', this.handleTrace);

    return this.registerSourceMaps();
  };

  public registerSourceMaps = async () => {
    if (!this.appContext.appPackage || !this.appContext.appPackage.sourceMaps) {
      return;
    }

    const sourceMaps: SourceMappedComponents = {
      companion: this.appContext.appPackage.sourceMaps.companion,
      settings: this.appContext.appPackage.sourceMaps.settings,
    };

    if (this.appHost && this.appContext.appPackage.sourceMaps.device) {
      try {
        const family = compatibility.findCompatibleAppComponent(
          this.appContext.appPackage,
          this.appHost.info,
        );

        sourceMaps.app = this.appContext.appPackage.sourceMaps.device[family];
      } catch {}
    }

    const sourceMapConsumers = await mapValues(
      lodash(sourceMaps).pickBy().value(),
      async (maps) =>
        mapValues(maps!, async (map) => new SourceMapConsumer(map as any)),
    );

    this.componentSourceMapConsumers = {
      ...this.componentSourceMapConsumers,
      ...sourceMapConsumers,
    };
  };

  private handleLog = (message: ConsoleMessage) => {
    this.messageFormatter(
      sourceMapMessage(message, this.componentSourceMapConsumers),
    );
  };

  private handleTrace = (message: ConsoleTrace) => {
    this.messageFormatter(
      sourceMapMessage(message, this.componentSourceMapConsumers),
    );
  };
}
