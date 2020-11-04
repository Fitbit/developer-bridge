import vorpal from '@moleculer/vorpal';
import untildify from 'untildify';

import AppContext from '../models/AppContext';

export const defaultAppPath = './build/app.fba';

export const setAppPackageAction = async (
  cli: vorpal,
  appContext: AppContext,
  packagePath?: string,
) => {
  try {
    let loadPath = packagePath;

    if (!loadPath) {
      if (appContext.appPackagePath) {
        // If we're using the same package, reload it incase it changed
        // on disk since we last installed.
        loadPath = appContext.appPackagePath;
        cli.activeCommand.log(
          `No app package specified. Reloading ${loadPath}.`,
        );
      } else {
        loadPath = defaultAppPath;
        cli.activeCommand.log(
          `No app package specified. Using default ${loadPath}.`,
        );
      }
    }

    const appPackage = await appContext.loadAppPackage(untildify(loadPath));
    const { uuid, buildId } = appPackage;
    cli.activeCommand.log(`Loaded appID:${uuid} buildID:${buildId}`);
    return appPackage;
  } catch (ex) {
    cli.activeCommand.log(`Failed to load app package. ${ex}`);
  }
};

export default function setAppPackage(stores: { appContext: AppContext }) {
  return (cli: vorpal) => {
    cli
      .command('set-app-package [packagePath]', 'Set the current app package')
      .types({ string: ['packagePath'] })
      .hidden()
      .action(async (args: vorpal.Args & { packagePath?: string }) =>
        setAppPackageAction(cli, stores.appContext, args.packagePath),
      );
  };
}
