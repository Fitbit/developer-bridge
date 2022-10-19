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

#### Usage on Linux

If you're using these tools on Linux, there's a couple extra steps you may need to take. These could vary a little dependent on what distro you use. The steps below are for Ubuntu and derivatives but you can adapt for your distro:

- Install libsecret-1-dev: `sudo apt-get install libsecret-1-dev`
- Add a udev rule to give your user access to connected Fitbit devices, by creating a file at `/etc/udev/rules.d/99-fitbit-sdk.rules` with the following content: `SUBSYSTEM=="usb", ATTRS{idVendor}=="2687", ATTRS{idProduct}=="fd13", GROUP="plugdev", TAG+="uaccess"`
- Once you've added the rule, unplug any Fitbit devices and plug them in again for the changes to apply

#### Debugging

You can capture all Developer Bridge protocol messages for debugging purposes by setting the `FITBIT_DEVBRIDGE_DUMP` environment variable to `1` before starting the debugger. A log file will be written to the working directory for each connection. It is often useful to include this information where possible when reporting bugs.
