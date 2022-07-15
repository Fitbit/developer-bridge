import vorpal from '@moleculer/vorpal';

import HostConnections from '../models/HostConnections';

async function hostsAction(
  cli: vorpal,
  { hostConnections }: { hostConnections: HostConnections },
) {
  const hosts = await hostConnections.list();

  cli.activeCommand.log('Hosts:');
  cli.activeCommand.log(hosts);
}

export default function (stores: { hostConnections: HostConnections }) {
  return (cli: vorpal) => {
    cli
      .command('hosts', 'lists hosts and their status')
      .action(async () => hostsAction(cli, stores));
  };
}
