import vorpal from 'vorpal';

import { hosts } from '../api/developerRelay';

export default (cli: vorpal) => {
  cli
  .command('hosts', 'lists hosts and their status')
  .action(async () => {
    const { appHost, companionHost } = await hosts();

    cli.activeCommand.log('Devices:');
    cli.activeCommand.log(appHost);
    cli.activeCommand.log('Phones:');
    cli.activeCommand.log(companionHost);
  });
};
