import * as t from 'io-ts';

import { Point } from './Structures';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

export const Button = t.union(
  [t.literal('up'), t.literal('down'), t.literal('back')],
  'Button',
);
export type Button = t.TypeOf<typeof Button>;

export const ButtonInput = t.interface(
  {
    /**
     * Which button is being pressed.
     */
    button: Button,
  },
  'ButtonInput',
);
export type ButtonInput = t.TypeOf<typeof ButtonInput>;

export const TouchState = t.union(
  [t.literal('up'), t.literal('down'), t.literal('move')],
  'TouchState',
);
export type TouchState = t.TypeOf<typeof TouchState>;

export const TouchInput = t.interface(
  {
    /**
     * Status of simulated touch.
     * 'move' must only be sent in the period between a 'down' input and its corresponding 'up'.
     */
    state: TouchState,

    /**
     * Location of touch event.
     */
    location: Point,
  },
  'TouchInput',
);
export type TouchInput = t.TypeOf<typeof TouchInput>;

/**
 * Capabilities specific to inputs.
 */
export const InputCapabilities = t.partial(
  {
    /**
     * The Host supports sending simulated button presses.
     */
    buttons: t.array(Button),

    /**
     * The Host supports sending simulated touch screen presses.
     */
    touch: t.boolean,
  },
  'InputCapabilities',
);
export type InputCapabilities = t.TypeOf<typeof InputCapabilities>;
