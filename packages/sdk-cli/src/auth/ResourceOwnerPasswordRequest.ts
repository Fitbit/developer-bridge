export interface ResoureOwnerTokenRequestJson {
  grant_type: 'password';
  client_id: string;
  username: string;
  password: string;
  extras?: Record<string, string>;
}

export default class ResoureOwnerTokenRequest {
  clientId: string;
  username: string;
  password: string;
  extras?: Record<string, string>;

  constructor(request: ResoureOwnerTokenRequestJson) {
    this.clientId = request.client_id;
    this.username = request.username;
    this.password = request.password;
    this.extras = request.extras;
  }

  /**
   * Serializes a TokenRequest to a JavaScript object.
   */
  toJson(): ResoureOwnerTokenRequestJson {
    return {
      grant_type: 'password',
      username: this.username,
      password: this.password,
      client_id: this.clientId,
      extras: this.extras,
    };
  }

  toStringMap(): Record<string, string> {
    const map: Record<string, string> = {
      grant_type: 'password',
      client_id: this.clientId,
      username: this.username,
      password: this.password,
    };

    // copy over extras
    if (this.extras) {
      for (const extra in this.extras) {
        if (this.extras.hasOwnProperty(extra) && !map.hasOwnProperty(extra)) {
          // check before inserting to requestMap
          map[extra] = this.extras[extra];
        }
      }
    }
    return map;
  }
}
