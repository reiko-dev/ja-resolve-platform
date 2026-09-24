/**
 * TOW ROUND — Socket.IO tracking publisher adapter (unit).
 *
 * The adapter is the ONLY file in the Tow module that touches the realtime
 * service, and it must never make the application depend on Socket.IO being
 * initialized: the port degrades to a silent no-op when the server is absent,
 * and the REST read remains the recovery path.
 */
'use strict';

const {
  createSocketTrackingPublisher,
} = require('../../../src/modules/tow/adapters/events/socket-tracking-publisher');

describe('TOW ROUND — socket tracking publisher adapter', () => {
  test('forwards the minimal event to the realtime service', () => {
    const sendTowTrackingUpdated = jest.fn();
    const publisher = createSocketTrackingPublisher({
      socketService: { sendTowTrackingUpdated },
    });

    expect(publisher.publishTrackingUpdated({
      request_id: '42',
      received_at: '2026-01-15T12:04:00.000Z',
    })).toBe(true);

    expect(sendTowTrackingUpdated).toHaveBeenCalledWith('42', {
      received_at: '2026-01-15T12:04:00.000Z',
    });
  });

  test('a missing instant is forwarded as null, never invented', () => {
    const sendTowTrackingUpdated = jest.fn();
    const publisher = createSocketTrackingPublisher({
      socketService: { sendTowTrackingUpdated },
    });

    publisher.publishTrackingUpdated({ request_id: 7 });

    expect(sendTowTrackingUpdated).toHaveBeenCalledWith(7, { received_at: null });
  });

  test('rejects an event without a canonical request id', () => {
    const publisher = createSocketTrackingPublisher({
      socketService: { sendTowTrackingUpdated: jest.fn() },
    });

    expect(() => publisher.publishTrackingUpdated({})).toThrow(/request_id/);
    expect(() => publisher.publishTrackingUpdated({ request_id: '' })).toThrow(/request_id/);
  });

  test('degrades to false when the realtime service cannot emit', () => {
    const publisher = createSocketTrackingPublisher({ socketService: {} });
    expect(publisher.publishTrackingUpdated({ request_id: '1' })).toBe(false);
  });

  test('loading the module never opens a connection and the default is a safe no-op', () => {
    // The real singleton is resolved lazily and is uninitialized outside a
    // listening server: publishing must not throw and must not fabricate state.
    const publisher = createSocketTrackingPublisher();
    expect(() => publisher.publishTrackingUpdated({ request_id: '1' })).not.toThrow();
  });
});
