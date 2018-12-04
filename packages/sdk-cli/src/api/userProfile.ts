
import * as t from 'io-ts';

import { apiFetch, decodeJSON } from './baseAPI';

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
