
import * as t from 'io-ts';

import { apiFetch } from './baseAPI';
import { decodeJSON } from '../util/fetchUtil';

// tslint:disable-next-line:variable-name
const UserProfileResponse = t.type(
  {
    user: t.type({
      email: t.string,
      fullName: t.string,
    }),
  },
  'UserProfileResponse',
);

export default async function userProfile() {
  const response = await apiFetch('1/user/-/profile.json')
    .then(decodeJSON(UserProfileResponse));
  return response.user;
}
