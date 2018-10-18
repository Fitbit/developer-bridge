import * as t from 'io-ts';

import { UUID, Component } from './Structures';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

/**
 * Capabilities specific to launching of installed apps.
 */
export const LaunchCapabilities = t.partial(
  {
    /**
     * The Host supports launching of the device app component with
     * the 'app.launchComponent' request.
     */
    appComponent: t.partial({
      canLaunch: t.boolean,
    }),
  },
  'LaunchCapabilities',
);
export type LaunchCapabilities = t.TypeOf<typeof LaunchCapabilities>;

export const LaunchComponentParams = t.interface(
  {
    /**
     * UUID of the app to launch.
     */
    uuid: UUID,

    /**
     * Component of the app to launch.
     */
    component: Component,
  },
  'LaunchComponentParams',
);
export type LaunchComponentParams = t.TypeOf<typeof LaunchComponentParams>;
