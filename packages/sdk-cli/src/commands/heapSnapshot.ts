import * as path from 'path';

import dateformat from 'dateformat';
import untildify from 'untildify';
import vorpal from '@moleculer/vorpal';

import AppContext from '../models/AppContext';
import captureHeapSnapshot from '../models/captureHeapSnapshot';
import * as compatibility from '../models/compatibility';
import HostConnections from '../models/HostConnections';
import { ComponentSourceMaps } from '@fitbit/app-package';

export default function heapSnapshot(stores: {
  hostConnections: HostConnections;
  appContext: AppContext;
}) {
  return (cli: vorpal) => {
    cli
      .command(
        'heap-snapshot [path]',
        // tslint:disable-next-line:max-line-length
        'Capture a JS heap snapshot from the connected device and write the data to a file (experimental)',
      )
      .option('-f, --format <fmt>', 'heap snapshot format to request', () => {
        if (!stores.hostConnections.appHost) return [];
        return [
          ...stores.hostConnections.appHost.host.getHeapSnapshotSupport()
            .formats,
          'v8',
        ];
      })
      .types({ string: ['f', 'format', 'path'] })
      .action(async (args: vorpal.Args & { path?: string }) => {
        const { appHost } = stores.hostConnections;
        if (!appHost) {
          cli.activeCommand.log('Not connected to a device');
          return false;
        }

        const { appPackage } = stores.appContext;
        if (!appPackage) {
          cli.activeCommand.log(
            'App package not loaded, use `install` or `set-app-package` commands first',
          );
          return false;
        }

        const { supported, formats } = appHost.host.getHeapSnapshotSupport();

        const snapshotFormats = ['v8', ...formats];

        if (!supported) {
          cli.activeCommand.log(
            'Device does not support capturing JS heap snapshots',
          );
          return false;
        }

        let { format } = args.options;
        if (!format) {
          if (snapshotFormats.length === 0) {
            cli.activeCommand.log(
              'Device does not support any heap snapshot formats',
            );
            return false;
          }
          if (snapshotFormats.length === 1) {
            format = formats[0];
            cli.activeCommand.log(
              `Requesting a JS heap snapshot in ${JSON.stringify(
                format,
              )} format`,
            );
          } else {
            format = (
              await cli.activeCommand.prompt<{ format: string }>({
                type: 'list',
                name: 'format',
                message:
                  'Which format would you like the JS heap snapshot to be in?',
                choices: snapshotFormats,
              })
            ).format;
          }
        }

        const extension = format === 'v8' ? 'heapsnapshot' : 'bin';
        const destPath = path.resolve(
          args.path
            ? untildify(args.path)
            : dateformat(`"js-heap." yyyy-mm-dd.H.MM.ss."${extension}"`),
        );

        let sourceMaps: ComponentSourceMaps | undefined;
        if (
          appPackage.sourceMaps !== undefined &&
          appPackage.sourceMaps.device
        ) {
          const deviceFamily = compatibility.findCompatibleAppComponent(
            appPackage,
            appHost.host.info,
          );
          sourceMaps = appPackage.sourceMaps.device[deviceFamily];
        }

        try {
          await captureHeapSnapshot(
            appHost.host,
            format,
            destPath,
            appPackage.uuid,
            sourceMaps,
          );
          cli.activeCommand.log(`JS heap snapshot saved to ${destPath}`);
          return true;
        } catch (ex) {
          cli.activeCommand.log(String(ex));
          return false;
        }
      });
  };
}
