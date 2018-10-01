import nock from 'nock';

import * as auth from '../auth';
import environment from '../auth/environment';
import userProfile from './userProfile';

jest.mock('../auth');

it('returns a user object', () => {
  (auth.getAccessToken as jest.Mock).mockResolvedValueOnce('mockToken');
  const endpointMock = nock(environment().config.apiUrl);
  endpointMock
    .get('/1/user/-/profile.json')
    .reply(200, {
      user: {
        fullName: 'John Smith',
        email: 'john.smith@example.com',
      },
    });
  return expect(userProfile()).resolves.toMatchSnapshot();
});
