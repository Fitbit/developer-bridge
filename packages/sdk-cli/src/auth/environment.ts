import process from 'process';
// tslint:disable-next-line:import-name
import environments from './environments.json';

export default () => {
  const defaultEnv = 'production';
  const environment = (
    process.env.FITBIT_SDK_ENVIRONMENT || defaultEnv
  ) as keyof typeof environments;

  if (Object.keys(environments).indexOf(environment) === -1) {
    throw new Error(`Invalid environment specified: ${environment}`);
  }

  const config = environments[environment];

  const clientId = process.env.FITBIT_SDK_CLIENT_ID;

  if (clientId) {
    config.clientId = clientId;
  }

  return {
    environment,
    config,
  };
};
