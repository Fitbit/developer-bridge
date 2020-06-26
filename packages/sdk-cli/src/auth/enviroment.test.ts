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

it('uses FITBIT_SDK_CLIENT_ID if provided', () => {
  const clientId = '_fake_client_id_';

  process.env.FITBIT_SDK_CLIENT_ID = clientId;

  expect(environment()).toEqual(
    {
      config: expect.objectContaining({
        clientId,
      }),
      environment: 'production',
    },
  );
});
