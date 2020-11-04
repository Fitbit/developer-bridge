import * as t from 'io-ts';

import {
  App,
  Component,
  ComponentBundleKind,
  ReleaseSemver,
  Semver,
} from './Structures';

// Runtime types are variables which are used like types, which is
// reflected in their PascalCase naming scheme.
/* tslint:disable:variable-name */

export const APICompatibilityDescriptor = t.intersection(
  [
    t.interface({
      /**
       * Maximum compatible API version for the component.
       *
       * This field signifies that the Host supports components which
       * require a release API version less than or equal to the given
       * version using the semver 2.0.0 precedence rules.
       *
       * This string MUST follow the format of a semver version number.
       */
      maxAPIVersion: ReleaseSemver,
    }),

    t.partial({
      /**
       * Exact API version compatibility for the component.
       *
       * This field signifies that the Host is also compatible with
       * components which require one of the listed API versions. The
       * Host is considered to satisfy the app's API version requirement
       * if the component's API version requirement is equal to one of
       * the listed API versions, using the semver 2.0.0 precedence rules.
       *
       * Prerelease API versions are permitted, and can satisfy a
       * component bundle's requirement for prerelease API version.
       *
       * This string MUST follow the format of a semver version number.
       */
      exactAPIVersion: t.array(Semver),
    }),
  ],
  'APICompatibilityDescriptor',
);
export type APICompatibilityDescriptor = t.TypeOf<
  typeof APICompatibilityDescriptor
>;

export const AppHostDescriptor = t.intersection(
  [
    // Partial<APICompatibilityDescriptor>
    // io-ts does not support t.partial(SomeInterface), unfortunately.
    t.partial({
      maxAPIVersion: ReleaseSemver,
      exactAPIVersion: t.array(Semver),
    }),

    t.interface({
      /**
       * Host family name (product codename).
       */
      family: t.string,

      /**
       * Host software version, excluding the product ID part.
       *
       * This string SHOULD follow the format of a semver version number.
       * The semantics of semver are not assumed.
       */
      version: t.string,
    }),
  ],
  'AppHostDescriptor',
);
export type AppHostDescriptor = t.TypeOf<typeof AppHostDescriptor>;

export const CompanionHostDescriptor = APICompatibilityDescriptor;
export type CompanionHostDescriptor = APICompatibilityDescriptor;

/**
 * Capabilities specific to installation of app components.
 */
export const AppInstallCapabilities = t.partial(
  {
    /**
     * The Host supports sideloading components in-band with bulk data
     * transfer by supporting the requests
     * 'app.install.stream.begin', 'app.install.stream.finalize' and
     * 'app.install.stream.abort'. The Host MUST advertise support
     * for the 'io.write' capability if it supports this capability.
     */
    sideloadStream: t.boolean,

    /**
     * The Host supports installation of the device app component
     * bundle.
     */
    appBundle: t.boolean,

    /**
     * The Host supports installation of the app companion component
     * bundle (companion and settings components).
     */
    companionBundle: t.boolean,

    /**
     * The compatibility matrix for apps which this Host supports.
     *
     * Each entry in this list is a declaration that the Host is
     * capable of installing and running any device component which
     * itself declares that it is compatible with a platform
     * matching that description.
     *
     * The list MUST be sorted in order of preference with most
     * preferred first. In the case where an app package contains
     * more than one device component that is compatible with this
     * Host, the Debugger SHOULD install the component which is
     * compatible with the most preferred entry in the list.
     */
    appCompatibility: t.array(AppHostDescriptor),

    /**
     * The compatibility descriptor for companions which this Host
     * supports.
     *
     * This is a declaration that the Host is capable of installing
     * and running any companion component whose requirements are
     * satisfied by the given compatibility descriptor.
     */
    companionCompatibility: CompanionHostDescriptor,

    /**
     * This Host supports upgrading installed components via partial
     * bundles.
     */
    partialBundle: t.boolean,
  },
  'AppInstallCapabilities',
);
export type AppInstallCapabilities = t.TypeOf<typeof AppInstallCapabilities>;

export const AppInstallStreamBeginParams = t.interface(
  {
    /**
     * Component bundle to install.
     */
    componentBundle: ComponentBundleKind,
  },
  'AppInstallStreamBeginParams',
);
export type AppInstallStreamBeginParams = t.TypeOf<
  typeof AppInstallStreamBeginParams
>;

export const InstallType = t.keyof(
  {
    full: null,
    partial: null,
  },
  'InstallType',
);

export type InstallType = t.TypeOf<typeof InstallType>;

export const AppInstallResult = t.intersection(
  [
    t.interface({
      /**
       * Application which was sideloaded and installed.
       */
      app: App,

      /**
       * Set of components which were installed from the bundle.
       */
      components: t.array(Component),
    }),
    t.partial({
      installType: InstallType,
    }),
  ],
  'AppInstallResult',
);
export type AppInstallResult = t.TypeOf<typeof AppInstallResult>;
