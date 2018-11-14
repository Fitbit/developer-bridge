import vorpal from 'vorpal';

import { buildAction } from './build';
import { installAction } from './install';

import AppContext from '../models/AppContext';
import HostConnections from '../models/HostConnections';

export default function buildAndInstall(
  stores: {
    hostConnections: HostConnections,
    appContext: AppContext,
  },
) {
  return (cli: vorpal) => {
    cli
    .command('build-and-install [packagePath]', 'Build and install an application')
    .alias('bi')
    .action(async (args: vorpal.Args & { packagePath?: string }) => {
      await buildAction(cli);
      return installAction(cli, stores, args);
    });
  };
}
