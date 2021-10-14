import vorpal from '@moleculer/vorpal';

import { DeveloperRelay } from '../api/developerRelay';

export default (cli: vorpal) => {
  // TODO: Won't submit PR until this is fixed. `hosts` command would probably need to
  // take into consideration whether `connect` was called with --local.
  cli.command('hosts', 'lists hosts and their status').action(async () => {
    const developerRelay = new DeveloperRelay();
    const { appHost, companionHost } = await developerRelay.hosts();

    cli.activeCommand.log('Devices:');
    cli.activeCommand.log(appHost);
    cli.activeCommand.log('Phones:');
    cli.activeCommand.log(companionHost);
  });
};
