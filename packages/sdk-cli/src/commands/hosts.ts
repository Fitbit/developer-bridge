import vorpal from '@moleculer/vorpal';
import DeveloperRelay from '../models/DeveloperRelay';

export default (cli: vorpal) => {
  cli
    .command('hosts', 'lists hosts and their status')
    .option('-l, --local', 'Connect using Local Relay')
    .action(
      async (
        args: vorpal.Args & {
          options: vorpal.Args['options'] & { local?: boolean };
        },
      ) => {
        const developerRelay: DeveloperRelay = await DeveloperRelay.create(
          args.options.local,
        );
        const { appHost, companionHost } = await developerRelay.hosts();

        cli.activeCommand.log('Devices:');
        cli.activeCommand.log(appHost);
        cli.activeCommand.log('Phones:');
        cli.activeCommand.log(companionHost);
      },
    );
};
