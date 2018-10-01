import vorpal from 'vorpal';

import * as auth from '../auth';

export default function logout(cli: vorpal) {
  cli
    .command('logout', 'Log out of your Fitbit account')
    .action(async () => {
      await auth.logout();
      cli.activeCommand.log('Logged out');
      process.exit(0);
    });
}
