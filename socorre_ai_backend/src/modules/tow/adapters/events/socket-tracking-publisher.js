/**
 * TOW ROUND — Socket.IO adapter for the tracking invalidation signal.
 *
 * The canonical persisted point is the authority; this adapter only forwards the
 * `tow_tracking_updated` signal to the room of the canonical request, so a
 * subscribed Cliente can refetch `GET /tow/requests/{requestId}/tracking`
 * immediately instead of waiting for the next poll.
 *
 * Boundaries:
 *   - the application layer depends on the `TrackingEventPublisher` PORT, never
 *     on Socket.IO: this adapter is the only file in the module that touches the
 *     realtime service, and the `socketService` singleton is resolved LAZILY
 *     (on the first publish), so importing the module never opens a connection
 *     and a missing/uninitialized server degrades to a silent no-op — the REST
 *     read remains the recovery path;
 *   - the payload is minimal on purpose (`request_id`, backend `received_at`):
 *     it is an invalidation signal, not a second position authority, so a
 *     consumer can never mistake the event for the canonical state.
 */
'use strict';

function createSocketTrackingPublisher({ socketService = null } = {}) {
  function resolveSocketService() {
    if (socketService) return socketService;
    // Lazy on purpose: the module must load (and tests must run) with no
    // Socket.IO server initialized.
    // eslint-disable-next-line global-require
    return require('../../../../services/socketService');
  }

  /**
   * @param {{ request_id: string, received_at: string|null }} event
   * @returns {boolean} true when the event was handed to an initialized server
   */
  function publishTrackingUpdated(event = {}) {
    const { request_id: requestId, received_at: receivedAt = null } = event;
    if (requestId === undefined || requestId === null || requestId === '') {
      throw new TypeError('publishTrackingUpdated requires a canonical request_id');
    }

    const service = resolveSocketService();
    if (!service || typeof service.sendTowTrackingUpdated !== 'function') return false;
    service.sendTowTrackingUpdated(requestId, { received_at: receivedAt });
    return true;
  }

  return { publishTrackingUpdated };
}

module.exports = { createSocketTrackingPublisher };
