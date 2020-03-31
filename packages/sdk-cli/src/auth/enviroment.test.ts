import environment from './environment';

function isValidEnv(env: string) {
  process.env.FITBIT_SDK_ENVIRONMENT = env;
  expect(environment()).toEqual(
    expect.objectContaining({
      environment: env,
    }),
  );
}

function isInvalidEnv(env: string) {
  process.env.FITBIT_SDK_ENVIRONMENT = env;
  expect(environment).toThrowErrorMatchingSnapshot();
}

beforeEach(() => {
  delete process.env.FITBIT_SDK_ENVIRONMENT;
  delete process.env.FITBIT_SDK_CLIENT_ID;
  delete process.env.FITBIT_SDK_CLIENT_SECRET;
});

describe.each([
  'int',
  'stage',
  'production',
])('given an FITBIT_SDK_ENVIRONMENT value of "%s"', (env) => {
  test('returns environment data', () => isValidEnv(env));
});

describe.each([
  '__bad_env__',
])('given an FITBIT_SDK_ENVIRONMENT value of "%s"', (env) => {
  test('throws', () => isInvalidEnv(env));
});

it('defaults to the production environment', () => {
  expect(environment()).toEqual(
    expect.objectContaining({
      environment: 'production',
    }),
  );
});

it('uses FITBIT_SDK_CLIENT_ID and FITBIT_SDK_CLIENT_SECRET if provided', () => {
  const clientId = '_fake_client_id_';
  const clientSecret = '_fake_client_secret_';

  process.env.FITBIT_SDK_CLIENT_ID = clientId;
  process.env.FITBIT_SDK_CLIENT_SECRET = clientSecret;

  expect(environment()).toEqual(
    {
      config: expect.objectContaining({
        clientId,
        clientSecret,
      }),
      environment: 'production',
    },
  );
});

it('throws an error if only FITBIT_SDK_CLIENT_ID is set', () => {
  process.env.FITBIT_SDK_CLIENT_ID = '_fake_client_id_';
  expect(environment).toThrowErrorMatchingSnapshot();
});

it('throws an error if only FITBIT_SDK_CLIENT_SECRET is set', () => {
  process.env.FITBIT_SDK_CLIENT_SECRET = '_fake_client_secret_';
  expect(environment).toThrowErrorMatchingSnapshot();
});
