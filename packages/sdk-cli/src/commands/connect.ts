import { startCase } from 'lodash';
import vorpal from '@moleculer/vorpal';

import HostConnections, { Host } from '../models/HostConnections';
import { DeviceType } from '../models/HostTypes';

export const connectAction = async (
  cli: vorpal,
  deviceType: DeviceType,
  hostConnections: HostConnections,
) => {
  let host: Host;
  let availableHosts: Host[];

  try {
    const matchedHosts = await hostConnections.listOfType(deviceType);
    availableHosts = matchedHosts.filter((host) => host.available);
  } catch (ex) {
    cli.log(
      // tslint:disable-next-line:max-line-length
      `An error was encountered when loading the list of available ${deviceType} hosts: ${
        (ex as Error).message
      }`,
    );
    return false;
  }

  if (availableHosts.length === 0) {
    cli.activeCommand.log(`No ${deviceType}s are connected and available`);
    return false;
  }

  if (availableHosts.length === 1) {
    host = availableHosts[0];
    cli.activeCommand.log(
      `Auto-connecting only known ${deviceType}: ${host.displayName}`,
    );
  } else {
    host = (
      await cli.activeCommand.prompt<{
        host: Host;
      }>({
        type: 'list',
        name: 'host',
        message: `Which ${deviceType} do you wish to sideload to?`,
        choices: availableHosts.map((host) => ({
          name: host.displayName,
          value: host,
        })),
      })
    ).host;
  }

  const connection = await hostConnections.connect(host, deviceType);
  connection.stream.once('close', () =>
    cli.log(`${startCase(deviceType)} '${host.displayName}' disconnected`),
  );

  return true;
};

export default function (stores: { hostConnections: HostConnections }) {
  return (cli: vorpal) => {
    const deviceTypes: DeviceType[] = ['device', 'phone'];
    for (const deviceType of deviceTypes) {
      cli
        .command(`connect ${deviceType}`, `Connect a ${deviceType}`)
        .action(async () =>
          connectAction(cli, deviceType, stores.hostConnections),
        );
    }
  };
}
