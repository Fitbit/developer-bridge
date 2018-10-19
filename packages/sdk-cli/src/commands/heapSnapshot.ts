import * as path from 'path';

import dateformat from 'dateformat';
import untildify from 'untildify';
import vorpal from 'vorpal';

import HostConnections from '../models/HostConnections';
import captureHeapSnapshot from '../models/captureHeapSnapshot';

export default function install(
  stores: {
    hostConnections: HostConnections,
  },
) {
  return (cli: vorpal) => {
    cli
      .command(
        'heap-snapshot [path]',
        // tslint:disable-next-line:max-line-length
        'Capture a JS heap snapshot from the connected device and write the raw data to a file (experimental)',
      )
      .hidden()
      .option(
        '-f, --format <fmt>',
        'heap snapshot format to request',
        () => {
          if (!stores.hostConnections.appHost) return [];
          return stores.hostConnections.appHost.host.getHeapSnapshotSupport().formats;
        })
      .types({ string: ['f', 'format', 'path'] })
      .action(async (args: vorpal.Args & { path?: string }) => {
        const { appHost } = stores.hostConnections;
        if (!appHost) {
          cli.activeCommand.log('Not connected to a device');
          return false;
        }

        const { supported, formats } = appHost.host.getHeapSnapshotSupport();

        if (!supported) {
          cli.activeCommand.log('Device does not support capturing JS heap snapshots');
          return false;
        }

        let { format } = args.options;

        if (!format) {
          if (formats.length === 0) {
            cli.activeCommand.log('Device does not support any heap snapshot formats');
            return false;
          }
          if (formats.length === 1) {
            format = formats[0];
            cli.activeCommand.log(
              `Requesting a JS heap snapshot in ${JSON.stringify(format)} format`,
            );
          } else {
            format = (await cli.activeCommand.prompt<{ format: string }>({
              type: 'list',
              name: 'format',
              message: 'Which format would you like the JS heap snapshot to be in?',
              choices: formats,
            })).format;
          }
        }

        const destPath = path.resolve(
          args.path
            ? untildify(args.path)
            : dateformat('"js-heap." yyyy-mm-dd.H.MM.ss."bin"'),
        );

        try {
          await captureHeapSnapshot(appHost.host, format, destPath);
          cli.activeCommand.log(`JS heap snapshot saved to ${destPath}`);
          return true;
        } catch (ex) {
          cli.activeCommand.log(String(ex));
          return false;
        }
      });
  };
}
