import { startCase } from 'lodash';
import vorpal from '@moleculer/vorpal';

import * as developerRelay from '../api/developerRelay';
import HostConnections from '../models/HostConnections';

export type DeviceType = 'device' | 'phone';

export const connectAction = async (
  cli: vorpal,
  deviceType: DeviceType,
  hostConnections: HostConnections,
) => {
  let hosts: {
    appHost: developerRelay.Host[];
    companionHost: developerRelay.Host[];
  };

  try {
    hosts = await developerRelay.hosts();
  } catch (error) {
    cli.log(
      // tslint:disable-next-line:max-line-length
      `An error was encountered when loading the list of available ${deviceType} hosts: ${error.message}`,
    );
    return false;
  }

  const hostTypes: { [key: string]: keyof typeof hosts } = {
    device: 'appHost',
    phone: 'companionHost',
  };

  const hostType = hostTypes[deviceType];
  const matchedHosts = hosts[hostType].filter(
    (host) => host.state === 'available',
  );

  if (matchedHosts.length === 0) {
    cli.activeCommand.log(`No ${deviceType}s are connected and available`);
    return false;
  }

  let host: { id: string; displayName: string };
  if (matchedHosts.length === 1) {
    host = matchedHosts[0];
    cli.activeCommand.log(
      `Auto-connecting only known ${deviceType}: ${host.displayName}`,
    );
  } else {
    host = (
      await cli.activeCommand.prompt<{
        hostID: { id: string; displayName: string };
      }>({
        type: 'list',
        name: 'hostID',
        message: `Which ${deviceType} do you wish to sideload to?`,
        choices: matchedHosts.map((host) => ({
          name: host.displayName,
          value: { id: host.id, displayName: host.displayName },
        })),
      })
    ).hostID;
  }

  const connection = await hostConnections.connect(hostType, host.id);
  connection.ws.once('finish', () =>
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
