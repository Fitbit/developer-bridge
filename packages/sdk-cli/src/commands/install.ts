import chalk from 'chalk';
import lodash from 'lodash';
import vorpal from '@moleculer/vorpal';

import AppContext from '../models/AppContext';
import HostConnections from '../models/HostConnections';
import * as sideload from '../models/sideload';

import { connectAction } from './connect';
import { setAppPackageAction } from './setAppPackage';

type InstallArgs = vorpal.Args & {
  packagePath?: string;
  options: {
    skipLaunch?: boolean;
    useDevice?: string;
  };
};

export const installAction = async (
  cli: vorpal,
  stores: { hostConnections: HostConnections; appContext: AppContext },
  args: InstallArgs,
) => {
  const makeProgressCallback = (componentType: string) => {
    cli.ui.redraw(`Sideloading ${componentType}: starting...`);
    return (sent: number, total: number) => {
      const percentComplete = Math.round((sent / total) * 100);
      cli.ui.redraw(
        `Sideloading ${componentType}: ${percentComplete}% completed`,
      );
    };
  };

  const printCompletionStatus = (componentType: string) => (
    result: { installType: string } | null,
  ) => {
    if (result) {
      cli.ui.redraw(
        `${componentType} install complete (${result.installType})`,
      );
    } else {
      cli.ui.redraw(`${componentType} is already installed`);
    }

    cli.ui.redraw.done();
  };

  const { appContext, hostConnections } = stores;

  const appPackage = await setAppPackageAction(
    cli,
    appContext,
    args.packagePath,
  );
  if (!appPackage) return false;

  const hasApp =
    Object.keys(lodash.get(appPackage, 'components.device') || {}).length > 0;
  const hasCompanion = !!lodash.get(appPackage, 'components.companion');
  if (!hasApp) {
    if (!hasCompanion) {
      cli.activeCommand.log(
        'Nothing to do: app contains neither a device nor a companion component',
      );
      return false;
    }

    cli.activeCommand.log(
      chalk.keyword('orange')('This app does not contain a device component'),
    );
  }

  if (
    hasApp &&
    (!hostConnections.appHost || hostConnections.appHost.host.rpc.ended)
  ) {
    cli.activeCommand.log('App requires a device, connecting...');
    const result = await connectAction(cli, 'device', hostConnections);
    if (!result) return false;
  }

  if (
    hasCompanion &&
    (!hostConnections.companionHost ||
      hostConnections.companionHost.host.rpc.ended)
  ) {
    cli.activeCommand.log('App requires a phone, connecting...');
    const result = await connectAction(cli, 'phone', hostConnections);
    if (!result) return false;
  }

  const { appHost, companionHost } = hostConnections;

  try {
    if (hasApp && appHost) {
      const { useDevice } = args.options;
      if (useDevice && appPackage.components.device[useDevice] === undefined) {
        cli.activeCommand.log(
          `Requested '${useDevice}' bundle to be used, but it isn't present within the app package`,
        );
        return false;
      }

      await sideload
        .app(appHost.host, appPackage, makeProgressCallback('app'), useDevice)
        .then(printCompletionStatus('App'));
    }

    if (hasCompanion && companionHost) {
      await sideload
        .companion(
          companionHost.host,
          appPackage,
          makeProgressCallback('companion'),
        )
        .then(printCompletionStatus('Companion'));
    }
  } catch (ex) {
    cli.activeCommand.log(`Install failed: ${ex.message}`);
    return false;
  }

  if (hasApp && appHost) {
    if (
      appHost.host.hasCapability('appHost.launch.appComponent') &&
      appHost.host.info.capabilities.appHost!.launch!.appComponent!.canLaunch
    ) {
      if (args.options.skipLaunch !== true) {
        cli.activeCommand.log('Launching app');
        await appHost.host.launchAppComponent({
          uuid: appPackage.uuid,
          component: 'app',
        });
      }
    } else {
      cli.activeCommand.log('Device does not support launching app remotely');
    }
  }

  return true;
};

export default function install(stores: {
  hostConnections: HostConnections;
  appContext: AppContext;
}) {
  return (cli: vorpal) => {
    cli
      .command('install [packagePath]', 'Install an app package')
      .types({ string: ['packagePath', 'useDevice'] })
      .option('--skipLaunch', "Don't launch the app after installing")
      .option(
        '--useDevice <device>',
        'Install a device bundle for a specific device (eg higgs, mira)',
      )
      .action(async (args: InstallArgs) => installAction(cli, stores, args));
  };
}
