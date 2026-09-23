/**
 * MVP-01 — application ports.
 *
 * Interfaces only: the application layer depends on these shapes, never on
 * Express, Knex, the filesystem or a provider SDK. Adapters live under
 * `src/modules/tow/adapters/**` and are wired by `composition.js`.
 *
 * @typedef {Object} ModuleRepository
 * @property {(key: string) => Promise<object|null>} getByKey
 * @property {(row: object) => Promise<object>} createDefault
 * @property {(args: { key: string, enabled: boolean, reason: string, updatedBy: number|null }) => Promise<object>} setEnabled
 *
 * @typedef {Object} VehicleRepository
 * @property {(record: object) => Promise<object>} insert
 * @property {(id: number|string) => Promise<object|null>} findById
 * @property {(partnerId: number|string, id: number|string) => Promise<object|null>} findByPartnerAndId
 * @property {(partnerId: number|string) => Promise<object[]>} listByPartner
 * @property {(partnerId: number|string) => Promise<object|null>} findActiveByPartner
 * @property {(id: number|string, patch: object) => Promise<object>} update
 * @property {(args: { partnerId: number|string, vehicleId: number|string }) => Promise<object>} activate
 * @property {(args: { partnerId: number|string, vehicleId: number|string }) => Promise<object>} deactivate
 * @property {(id: number|string) => Promise<number>} remove
 *
 * @typedef {Object} DocumentRepository
 * @property {(record: object) => Promise<object>} insert
 * @property {(id: number|string) => Promise<object|null>} findById
 * @property {(vehicleId: number|string) => Promise<object[]>} listByVehicle
 * @property {(partnerId: number|string) => Promise<object[]>} listByPartner
 * @property {(id: number|string, patch: object) => Promise<object>} updateStatus
 * @property {(id: number|string) => Promise<number>} remove
 * @property {(filters: object) => Promise<object[]>} list
 *
 * @typedef {Object} SettingsRepository
 * @property {(keys: string[]) => Promise<object[]>} getByKeys
 * @property {(rows: object[]) => Promise<number>} upsertMany
 *
 * @typedef {Object} PartnerRepository
 * @property {(id: number|string) => Promise<{ id: number|string, type: string, is_available: boolean, is_online: boolean, is_verified: boolean, latitude: number|null, longitude: number|null }|null>} findById
 *
 * MVP-04 — the proposal store.
 *
 * `createIdempotent` mirrors `TowRequestRepository.createIdempotent`: the
 * adapter hashes `fingerprintSource` and resolves `(partner_id,
 * idempotency_key)` through the UNIQUE constraint, never through a
 * read-then-write check.
 *
 * Every method accepts an optional transaction handle through
 * `withTransaction(trx)`, which returns the same API bound to that transaction.
 * Binding is explicit because a query issued on the pool while a transaction is
 * open would silently escape it (and deadlock the single-connection SQLite
 * harness).
 *
 * @typedef {Object} TowProposalRepository
 * @property {(record: object, options: { fingerprintSource: string }) => Promise<{ row: object, created: boolean, same_payload: boolean }>} createIdempotent
 * @property {(id: number|string) => Promise<object|null>} findById
 * @property {(id: number|string, partnerId: number|string) => Promise<object|null>} findByIdForPartner
 * @property {(args: { partnerId: number|string, requestId: number|string }) => Promise<object|null>} findActiveForPartnerAndRequest
 * @property {(requestId: number|string, filters: { limit: number, offset: number, status?: string|null }) => Promise<{ rows: object[], total: number }>} listByRequest
 * @property {(partnerId: number|string, filters: { limit: number, offset: number, status?: string|null }) => Promise<{ rows: object[], total: number }>} listByPartner
 * @property {(requestIds: Array<number|string>) => Promise<Array<number|string>>} findLiveRequestIds
 * @property {(id: number|string) => Promise<object|null>} lockById
 * @property {(id: number|string, args: { decidedAt: Date|string }) => Promise<object|null>} markAccepted
 * @property {(id: number|string, args: { decidedAt: Date|string }) => Promise<object|null>} markWithdrawn  Guarded `ACTIVE -> WITHDRAWN`; resolves `null` when the row was concurrently accepted/closed.
 * @property {(requestId: number|string, args: { exceptProposalId: number|string, decidedAt: Date|string }) => Promise<number>} closeActiveForRequestExcept
 * @property {(trx: object) => object} withTransaction
 *
 * MVP-04 — the assignment store, and the ONLY authority on occupancy.
 *
 * @typedef {Object} AssignmentRepository
 * @property {(record: object) => Promise<object>} createForProposal
 * @property {(id: number|string) => Promise<object|null>} findById
 * @property {(requestId: number|string) => Promise<object|null>} findByRequestId
 * @property {(proposalId: number|string) => Promise<object|null>} findByProposalId
 * @property {(requestIds: Array<number|string>) => Promise<object[]>} findByRequestIds
 * @property {(trx: object) => object} withTransaction
 *
 * MVP-06 — the canonical CASH payment store, and the ONLY writer of
 * `tow_payments`. `createForAssignment` lets the database decide uniqueness;
 * `markReceived` is the guarded `PENDING -> RECEIVED` transition that makes a
 * retry unable to restamp `received_at`.
 *
 * @typedef {Object} TowPaymentRepository
 * @property {(towRequestId: number|string) => Promise<object|null>} findByRequestId
 * @property {(towRequestIds: Array<number|string>) => Promise<object[]>} findByRequestIds
 * @property {(assignmentId: number|string) => Promise<object|null>} findByAssignmentId
 * @property {(record: object) => Promise<{ row: object|null, conflict: 'request'|'assignment'|null }>} createForAssignment
 * @property {(towRequestId: number|string, args: { receivedAt: Date|string, receivedByPartnerId: number|string, updatedAt?: Date|string }) => Promise<{ row: object|null, transitioned: boolean }>} markReceived
 * @property {(trx: object) => object} withTransaction
 *
 * MVP-04 — the transaction boundary.
 *
 * The application layer decides WHAT must be atomic; the adapter decides how the
 * database expresses it. `run` hands the callback a transaction handle that is
 * only ever consumed through `withTransaction(trx)`.
 *
 * @typedef {Object} UnitOfWork
 * @property {<T>(work: (trx: object) => Promise<T>) => Promise<T>} run
 *
 * MVP-03 — the canonical tow request store.
 *
 * `createIdempotent` is the ONLY creation path and it owns the atomicity: the
 * adapter hashes `fingerprintSource` (Domain/Application never touch
 * `node:crypto`) and resolves `(customer_id, idempotency_key)` through the
 * database constraint, not through a read-then-write race.
 *
 * @typedef {Object} TowRequestRepository
 * @property {(record: object, options: { fingerprintSource: string }) => Promise<{ row: object, created: boolean, same_payload: boolean }>} createIdempotent
 * @property {(id: number|string) => Promise<object|null>} findById
 * @property {(id: number|string, customerId: number|string) => Promise<object|null>} findByIdForCustomer
 * @property {(customerId: number|string, filters: { limit: number, offset: number, state?: string|null, from?: Date|null, to?: Date|null }) => Promise<{ rows: object[], total: number }>} listForCustomer
 * @property {(options: { limit: number }) => Promise<object[]>} listSearchingCandidates
 *
 * @typedef {Object} FileStorage
 * @property {(file: { buffer: Buffer, originalName: string, mimeType: string, keyPrefix?: string }) => Promise<{ key: string }>} save
 * @property {(key: string) => Promise<Buffer>} read  Reads the private bytes; rejects with `ENOENT` when absent.
 * @property {(key: string) => Promise<void>} remove
 *
 * @typedef {Object} Clock
 * @property {() => Date} now
 *
 * TOW ROUND — the realtime invalidation signal of the persisted tracking point.
 *
 * The socket is a FAST PATH, never an authority: the publisher receives the
 * canonical request id and the backend instant of the stored point, and a
 * consumer that misses the event recovers through
 * `GET /tow/requests/{requestId}/tracking`. Publishing must never fail the
 * write: the application calls it AFTER the transaction committed and swallows
 * (with a safe log) any transport failure.
 *
 * @typedef {Object} TrackingEventPublisher
 * @property {(event: { request_id: string, received_at: string }) => void} publishTrackingUpdated
 *
 *
 * MVP-02 — authoritative route distance.
 *
 * The application asks for the trip `origin -> pickup -> destination` and gets
 * back the legs Google returned, unchanged. Implementations must never estimate,
 * scale or interpolate a distance: an unavailable provider is an error, not a
 * fallback.
 *
 * @typedef {Object} RouteProvider
 * @property {(request: { origin: { latitude: number, longitude: number }, destination: { latitude: number, longitude: number }, pickup?: { latitude: number, longitude: number } }) => Promise<{ provider_to_pickup: { distance_meters: number, duration_seconds: number }|null, pickup_to_destination: { distance_meters: number, duration_seconds: number }|null, encoded_polyline: string|null }>} computeRoute
 */
'use strict';

const PORT_NAMES = Object.freeze([
  'ModuleRepository',
  'VehicleRepository',
  'DocumentRepository',
  'SettingsRepository',
  'PartnerRepository',
  'TowRequestRepository',
  'TowProposalRepository',
  'AssignmentRepository',
  'TowPaymentRepository',
  'UnitOfWork',
  'FileStorage',
  'Clock',
  'RouteProvider',
  'TrackingEventPublisher',
]);

module.exports = { PORT_NAMES };
