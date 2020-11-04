import vorpal from '@moleculer/vorpal';

export default function commandTestHarness(extension: (cli: vorpal) => void) {
  const cli = new vorpal();
  // Quiet the MaxListenersExceeded warning when this harness is used in
  // many tests. Each vorpal instance registers a 'vorpal_ui_keypress'
  // listener on the `ui` singleton, and many vorpal instances are
  // created during a normal test run, so the warning is a false alarm.
  cli.ui.setMaxListeners(0);

  cli.use(extension);

  const mockLog = jest.fn();
  const mockPrompt = jest.fn();

  Object.defineProperty(cli, 'activeCommand', {
    value: {
      log: mockLog,
      prompt: mockPrompt,
    },
  });

  const mockUIRedraw: vorpal.Redraw = Object.assign(jest.fn(), {
    clear: jest.fn(),
    done: jest.fn(),
  });

  cli.ui.redraw = mockUIRedraw;
  cli.ui.log = mockLog;
  cli.log = mockLog;

  return {
    cli,
    mockLog,
    mockPrompt,
    mockUIRedraw,
  };
}
