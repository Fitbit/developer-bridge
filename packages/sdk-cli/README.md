Fitbit SDK CLI
=====================

Fitbit SDK CLI is a command line tool for debugging Fitbit OS apps and clock faces.

### Usage
Install Fitbit SDK to your project and run `npx fitbit` to launch the CLI. It will prompt you to log in (use the same account that your device is connected to) and then you can use the shell with the commands given below.

#### Commands
Commands that can be used within the shell
```
  help [command...]                             Provides help for a given command.
  exit                                          Exits application.
  build                                         Build application
  connect device                                Connect a device
  connect phone                                 Connect a phone
  install [packagePath] [--skipLaunch]          Install an app package
  screenshot [path] [--open]                    Capture a screenshot from the connected device
  logout                                        Log out of your Fitbit account
```

#### Debugging

You can capture all Developer Bridge protocol messages for debugging purposes by setting the `FITBIT_DEVBRIDGE_DUMP` environment variable to `1` before starting the debugger. A log file will be written to the working directory for each connection. It is often useful to include this information where possible when reporting bugs.
