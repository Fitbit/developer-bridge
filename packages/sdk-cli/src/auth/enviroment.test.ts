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

describe.each([
  'qa2',
  'qa1',
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
  delete process.env.FITBIT_SDK_ENVIRONMENT;
  expect(environment()).toEqual(
    expect.objectContaining({
      environment: 'production',
    }),
  );
});
