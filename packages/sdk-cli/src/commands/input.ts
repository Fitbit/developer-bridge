import { FDBTypes } from '@fitbit/fdb-protocol';
import { isRight } from 'fp-ts/lib/Either';
import vorpal from 'vorpal';

import HostConnections from '../models/HostConnections';

function isSupportedButton(
  supportedButtons: FDBTypes.Button[],
  button: string,
): button is FDBTypes.Button {
  return supportedButtons.includes(button as FDBTypes.Button);
}

function isValidTouchState(state: string): state is FDBTypes.TouchState {
  return isRight(FDBTypes.TouchState.decode(state));
}

const wait = (durationMs: number) =>
  new Promise(resolve => setTimeout(resolve, durationMs));

export default function input(stores: { hostConnections: HostConnections }) {
  return (cli: vorpal) => {
    cli
      .command('input button <button>', 'Simulate a button press on device')
      .hidden()
      .action(async (args: vorpal.Args & { button?: string }) => {
        const { appHost } = stores.hostConnections;
        if (!appHost) {
          cli.activeCommand.log('Not connected to a device');
          return false;
        }

        if (!appHost.host.hasButtonInputSupport()) {
          cli.activeCommand.log(
            'Connected device does not support simulated button presses',
          );
          return false;
        }

        cli.activeCommand.log(args.button);
        if (!isSupportedButton(appHost.host.buttons(), args.button!)) {
          cli.activeCommand.log(
            `Connected device does not support requested button type. Supported buttons: ${appHost.host
              .buttons()
              .join(', ')}`,
          );
          return false;
        }

        return appHost.host.simulateButtonPress(args.button);
      });

    cli
      .command(
        'input touch <state> <x> <y>',
        'Simualate a touch event on device',
      )
      .hidden()
      .action(
        async (
          args: vorpal.Args & { state?: string; x?: number; y?: number },
        ) => {
          const { appHost } = stores.hostConnections;
          if (!appHost) {
            cli.activeCommand.log('Not connected to a device');
            return false;
          }

          if (!appHost.host.hasTouchInputSupport()) {
            cli.activeCommand.log(
              'Connected device does not support simulated touch events',
            );
            return false;
          }

          if (args.state === 'tap') {
            await appHost.host.simulateTouch({ x: args.x!, y: args.y! }, 'down');
            await wait(250);
            await appHost.host.simulateTouch({ x: args.x!, y: args.y! }, 'up');
          } else {
            if (!isValidTouchState(args.state!)) {
              cli.activeCommand.log('Touch state provided was not valid');
              return false;
            }

            return appHost.host.simulateTouch(
              { x: args.x!, y: args.y! },
              args.state,
            );
          }
        },
      );
  };
}
