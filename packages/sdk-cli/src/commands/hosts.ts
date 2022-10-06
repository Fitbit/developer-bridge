import vorpal from '@moleculer/vorpal';

import HostConnections from '../models/HostConnections';

async function hostsAction(
  cli: vorpal,
  { hostConnections }: { hostConnections: HostConnections },
) {
  const deviceHosts = await hostConnections.listOfType('device');
  const phoneHosts = await hostConnections.listOfType('phone');

  cli.activeCommand.log('Device Hosts:');
  cli.activeCommand.log(deviceHosts);

  cli.activeCommand.log('Phone Hosts:');
  cli.activeCommand.log(phoneHosts);
}

export default function (stores: { hostConnections: HostConnections }) {
  return (cli: vorpal) => {
    cli
      .command('hosts', 'lists hosts and their status')
      .action(async () => hostsAction(cli, stores));
  };
}
