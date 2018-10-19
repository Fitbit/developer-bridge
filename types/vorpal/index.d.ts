// Typedoc definitions taken and modified from vorpal source https://github.com/dthree/vorpal

/// <reference types="inquirer" />
declare module 'vorpal' {
  import { EventEmitter } from 'events';
  import { Inquirer } from 'inquirer';

  class Vorpal {
    activeCommand: Vorpal.CommandInstance;
    session: Vorpal.Session;
    ui: Vorpal.UiInstance;

    /**
     * Set id for command line history
     * @param id
     * @return {Vorpal}
     * @api public
     */
    history(id: string): this;

    /**
     * Imports a library of Vorpal API commands
     * from another Node module as an extension
     * of Vorpal.
     *
     * @param {Function} commands
     * @return {Vorpal}
     * @api public
     */
    use(commands: (this: this, vorpal: this) => any): this;

    /**
     * Registers a new command in the vorpal API.
     *
     * @param {String} name
     * @param {String} desc
     * @return {Command}
     * @api public
     */
    command(name: string, desc?: string): Vorpal.Command;

    /**
     * Sets the permanent delimiter for this
     * Vorpal server instance.
     *
     * @param {String} str
     * @return {Vorpal}
     * @api public
     */
    delimiter(str: string): this;

    /**
     * Hook the tty prompt to this given instance
     * of vorpal.
     *
     * @return {Vorpal}
     * @api public
     */
    show(): this;

    /**
     * Executes a vorpal API command and
     * returns the response either through a
     * callback or Promise in the absence
     * of a callback.
     *
     * A little black magic here - because
     * we sometimes have to send commands 10
     * miles upstream through 80 other instances
     * of vorpal and we aren't going to send
     * the callback / promise with us on that
     * trip, we store the command, callback,
     * resolve and reject objects (as they apply)
     * in a local vorpal._command variable.
     *
     * When the command eventually comes back
     * downstream, we dig up the callbacks and
     * finally resolve or reject the promise, etc.
     *
     * Lastly, to add some more complexity, we throw
     * command and callbacks into a queue that will
     * be unearthed and sent in due time.
     *
     * @param {String} cmd
     * @param {Object} args
     * @return {Promise}
     * @api public
     */
    exec<T>(cmd: string, args: { [k: string]: any, sessionId?: string }): Promise<T>;
    exec<T>(cmd: string): Promise<T>;

    /**
     * Executes a Vorpal command in sync.
     *
     * @param {String} cmd
     * @param {Object} args
     * @return {*} stdout
     * @api public
     */
    execSync<T>(cmd: string): T;

    /**
     * Delegates to ui.log.
     *
     * @param {String} log
     * @return {Vorpal}
     * @api public
     */
    log(message?: any, ...optionalParams: any[]): this;

    /**
     * Registers a new 'mode' command in the vorpal API.
     *
     * @param {String} name
     * @param {String} desc
     * @return {Command}
     * @api public
     */
    mode(name: string, desc?: string): Vorpal.Command;
  }

  namespace Vorpal {
    interface Command {
      /**
       * Defines an action for a given command.
       *
       * @param {Function} fn
       * @return {Command}
       * @api public
       */
      action<T>(actionFn: (this: CommandInstance, args: Args) => void | Promise<T>): this;
      action<T>(actionFn: (this: CommandInstance, command: string) => void | Promise<T>): this;

      /**
       * Sets args for static typing of options
       * using minimist.
       *
       * @param {Object} types
       * @return {Command}
       * @api public
       */
      types(types: { string: string[] }): this;

      /**
       * Doesn't show command in the help menu.
       *
       * @return {Command}
       * @api public
       */
      hidden(): this;

      /**
       * Defines description for given command.
       *
       * @param {String} str
       * @return {Command}
       * @api public
       */
      description(str: string): this;

      /**
       * Defines a prompt delimiter for a
       * mode once entered.
       *
       * @param {String} delimiter
       * @return {Command}
       * @api public
       */
      delimiter(delimiter: string): this;

      /**
       * Defines an init action for a mode command.
       *
       * @param {Function} fn
       * @return {Command}
       * @api public
       */
      init(fn: () => void | Promise<void>): this;

      /**
       * Registers an option for given command.
       *
       * @param {String} flags
       * @param {String} description
       * @return {Command}
       * @api public
       */
      option(flags: string, description: string, autocomplete?: Autocomplete): this;

      /**
       * Defines a function to be called when the
       * command is canceled.
       *
       * @param fn
       * @returns {Command}
       * @api public
       */

      cancel(fn: () => void): this;
    }

    type Autocomplete =
      string[] |
      ((input: string) => string[] | Promise<string>) |
      ((input: string, callback: (completions: string[]) => void) => void);

    interface Args {
      options: {
        [name: string]: string;
      };
    }

    interface CommandInstance {
      log(message?: any, ...optionalParams: any[]): void;
      prompt: Inquirer['prompt'];
    }

    interface Session {
      id: number;
    }

    interface Redraw {
      (...message: string[]): void;
      done(): void;
    }

    interface UiInstance extends EventEmitter {
      redraw: Redraw;
      log(message?: any, ...optionalParams: any[]): void;
    }
  }

  export = Vorpal;
}
