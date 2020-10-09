import vorpal from '@moleculer/vorpal';

import HostConnections, { HostConnection } from '../models/HostConnections';

type REPLArgs = vorpal.Args & {
  uuid?: string;
};

export default function repl(stores: { hostConnections: HostConnections }) {
  return (cli: vorpal) => {
    const { hostConnections } = stores;

    const isHostConnected = (host: HostConnection | undefined) => host && !host.host.rpc.ended;

    const exitWithError = (message: string) => {
      cli.activeCommand.log(message);
      (cli as any)._exitMode({
        sessionId: cli.session.id,
      });
    };

    let uuid: string | undefined;

    cli
      .mode('repl device [uuid]')
      .types({ string: ['uuid'] })
      .description('Enter into a REPL with the connected device')
      .delimiter('repl$')
      .init((async (args: REPLArgs) => {
        const hostConnection = stores.hostConnections.appHost;

        if (!isHostConnected(hostConnection)) {
          return exitWithError('No device connected');
        }
        if (!hostConnection!.host.hasEvalSupport()) {
          return exitWithError('Connected device does not support REPL');
        }

        uuid = args.uuid;
        if (uuid) {
          cli.activeCommand.log(`Targeting REPL to UUID: ${uuid}`);
        }

        cli.activeCommand.log('Entering REPL mode, type "exit" to quit');
      }) as any as () => void)
      .action(async (command: string) => {
        const hostConnection = hostConnections.appHost;

        if (!isHostConnected(hostConnection)) {
          cli.activeCommand.log('Host disconnected, exiting REPL');
          cli.execSync('exit');
          return;
        }

        try {
          const result = await hostConnection!.host.eval(command, uuid);
          // No log on failure since a log/trace will be emitted
          if (result.success) cli.activeCommand.log(result.value);
        } catch (ex) {
          cli.activeCommand.log(ex);
        }
      });
  };
}
