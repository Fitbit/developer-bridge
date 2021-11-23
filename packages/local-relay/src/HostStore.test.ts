import Host from './Host';
import HostStore from './HostStore';

function mockHostById(id: string) {
  return new Host({ id, displayName: '', roles: [] });
}

describe('HostStore', () => {
  let hostStore: HostStore;

  beforeEach(() => {
    hostStore = new HostStore();
  });

  describe('get', () => {
    it('returns a host by id or undefined', () => {
      hostStore['hosts'].set('a', mockHostById('a'));
      hostStore['hosts'].set('b', mockHostById('b'));

      expect(hostStore.get('a')).toHaveProperty('id', 'a');
      expect(hostStore.get('c')).toBeUndefined();
    });
  });

  describe('addOrReplace', () => {
    it('replaces a host', () => {
      const id = 'a';

      hostStore['hosts'].set(id, new Host({ id, displayName: 'a', roles: [] }));

      hostStore.addOrReplace(new Host({ id, displayName: 'b', roles: [] }));
      expect(hostStore.get(id)).toHaveProperty('displayName', 'b');
    });

    it('adds a host', () => {
      const id = 'a';
      expect(hostStore.get(id)).toBeUndefined();

      hostStore.addOrReplace(mockHostById(id));

      expect(hostStore.get(id)).toBeDefined();
    });
  });

  describe('delete', () => {
    it('deletes and disconnects existing host', () => {
      const id = 'a';
      const mockHost = mockHostById(id);
      const disconnectSpy = jest
        .spyOn(mockHost, 'disconnect')
        .mockImplementationOnce(() => {});
      hostStore['hosts'].set(id, mockHost);

      expect(hostStore.delete(id)).toBe(mockHost);
      expect(disconnectSpy).toBeCalled();
    });

    it('returns undefined if no host', () => {
      expect(hostStore.delete('random')).toBeUndefined();
    });
  });

  describe('listAll', () => {
    it('lists all', () => {
      const hostA = mockHostById('a');
      const hostB = mockHostById('b');

      hostStore['hosts'].set('a', hostA);
      hostStore['hosts'].set('b', hostB);

      expect(hostStore.listAll()).toEqual([hostA, hostB]);
    });
  });

  describe('clearAll', () => {
    it('clears all', () => {
      hostStore['hosts'].set('a', mockHostById('a'));
      hostStore['hosts'].set('b', mockHostById('b'));

      expect(hostStore.listAll()).toHaveProperty('length', 2);

      hostStore.clearAll();

      expect(hostStore.listAll()).toEqual([]);
    });
  });
});
