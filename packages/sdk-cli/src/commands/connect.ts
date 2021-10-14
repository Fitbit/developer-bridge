import * as fs from 'fs/promises';
import * as child_process from 'child_process';
import { join } from 'path';
import { startCase } from 'lodash';
import vorpal from '@moleculer/vorpal';

import * as developerRelay from '../api/developerRelay';
import HostConnections from '../models/HostConnections';

export const RELAY_PKG_NAME = '@fitbit/local-developer-relay';
import { DeveloperRelay, Host } from '../api/developerRelay';

export type DeviceType = 'device' | 'phone';

export const connectAction = async (
  cli: vorpal,
  deviceType: DeviceType,
  hostConnections: HostConnections,
  relayAddress?: string,
) => {
  let hosts: {
    appHost: Host[];
    companionHost: Host[];
  };

  const relayInstance: DeveloperRelay = relayAddress
    ? new DeveloperRelay(relayAddress, false)
    : new DeveloperRelay();

  try {
    hosts = await relayInstance.hosts();
  } catch (error) {
    cli.log(
      // tslint:disable-next-line:max-line-length
      `An error was encountered when loading the list of available ${deviceType} hosts: ${
        (error as Error).message
      }`,
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

  const connection = await hostConnections.connect(
    hostType,
    host.id,
    relayInstance,
  );
  connection.ws.once('finish', () =>
    cli.log(`${startCase(deviceType)} '${host.displayName}' disconnected`),
  );

  return true;
};

export async function startLocalRelayAction(cli: vorpal) {
  if (!(await installRelayPkgPrompt(cli))) {
    return;
  }

  const relayJsPath = await relayEntryPointPath();
  // FORK:
  // https://nodejs.org/api/child_process.html#child_process_child_process_fork_modulepath_args_options
  // Unlike POSIX fork(), child_process.fork() creates a completely separate V8 process with its own memory.
  // Dangers of POSIX fork() (https://www.evanjones.ca/fork-is-dangerous.html) don't apply.
  child_process.fork(relayJsPath, {
    detached: true,
    // We don't want to read parent's stdin from child process, but we want to share the same stdout/stderr.
    // 'ipc' is fork()'s requirement.
    // https://nodejs.org/api/child_process.html#child_process_child_process_fork_modulepath_args_options
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
}

async function isRelayPkgInstalled() {
  // package.json _must_ be at the project root, and all dependencies _must_ be declared in package.json,
  // so this is standard way to check for installed dependencies.
  const { dependencies, devDependencies } = await readJsonFile(
    join(process.cwd(), 'package.json'),
  );

  return dependencies?.[RELAY_PKG_NAME] || devDependencies?.[RELAY_PKG_NAME];
}

// Find the path to relay's entry point (executable) file (package.json -> "main" field)
async function relayEntryPointPath(): Promise<string> {
  const pkgPath = join('node_modules', RELAY_PKG_NAME);
  const { main: entryPoint } = await readJsonFile(
    join(process.cwd(), pkgPath, 'package.json'),
  );

  return join(process.cwd(), pkgPath, entryPoint);
}

async function readJsonFile(path: string): Promise<Record<string, any>> {
  try {
    return JSON.parse(await fs.readFile(path, { encoding: 'utf-8' }));
  } catch (error) {
    return {};
  }
}

async function installRelayPkgPrompt(cli: vorpal): Promise<boolean> {
  if (!(await isRelayPkgInstalled())) {
    cli.log(
      "Local Developer Relay isn't installed in the current project. Please install @fitbit/local-developer-relay.",
    );

    // There is no single way to install dependencies, and the tools used highly vary between projects.
    // So we offload the responsibility of installing the @fitbit/local-developer-relay dependency to the user,
    // and simply ask for a user confirmation of whether the package has been installed.
    const { installed } = await cli.activeCommand.prompt({
      type: 'confirm',
      name: 'installed',
      message: `Please confirm that @fitbit/local-developer-relay is installed:`,
    });

    // We can't do anything if the user answered "no" to the previous prompt.
    if (!installed) {
      cli.log(
        'Sorry, but local connections (-l, --local flag) are only possible with @fitbit/local-developer-relay installed as a dependency in your project.',
      );
      return false;
    }

    // We can't fully trust the user's verbal installation confirmation, so we check it again.
    return installRelayPkgPrompt(cli);
  }

  return true;
}

export default function (stores: { hostConnections: HostConnections }) {
  return (cli: vorpal) => {
    const deviceTypes: DeviceType[] = ['device', 'phone'];
    for (const deviceType of deviceTypes) {
      cli
        .command(`connect ${deviceType}`, `Connect a ${deviceType}`)
        .option('-l, --local', 'Connect using Local Relay')
        .action(
          async (
            args: vorpal.Args & {
              options: vorpal.Args['options'] & { local?: boolean };
            },
          ) => {
            const local = args.options.local;

            if (local) {
              await startLocalRelayAction(cli);
            }

            await connectAction(cli, deviceType, stores.hostConnections, local);
          },
        );
    }
  };
}
