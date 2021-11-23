import Host, { HostInfo } from './Host';

export default class HostStore {
  private hosts = new Map<Host['id'], Host>();

  get(id: string): Host | undefined {
    return this.hosts.get(id);
  }

  addOrReplace(hostInfo: HostInfo) {
    const host = new Host(hostInfo);
    this.hosts.set(hostInfo.id, host);
    return host;
  }

  delete(id: string): Host | undefined {
    const host = this.hosts.get(id);
    host?.disconnect();

    if (this.hosts.delete(id)) {
      return host;
    }

    return undefined;
  }

  listAll() {
    return [...this.hosts.values()];
  }

  clearAll() {
    return this.hosts.clear();
  }
}
