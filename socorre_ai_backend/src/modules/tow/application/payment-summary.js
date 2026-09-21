/**
 * MVP-06 — the payment projection shared by every TowRequest DTO producer.
 *
 * `TowRequest.payment` must never be a second truth. It is always the projection
 * of the single `tow_payments` row for that request, produced by the domain's
 * `buildTowPaymentDto`. This module exists so the projection is resolved in ONE
 * place — a per-service copy is exactly how two DTOs drift apart.
 *
 * Resolution is batched for list endpoints (one query per page, never one per
 * row) and returns `null` when no payment row exists, which lets
 * `buildTowRequestDto` fall back to the truthful empty `NOT_SELECTED` summary.
 *
 * A missing repository is not an error: it degrades to the truthful empty
 * projection, which is what an un-wired caller should advertise.
 */
'use strict';

const { buildTowPaymentDto } = require('../domain');

/**
 * @param {object|null} paymentRepository
 * @param {unknown} requestId
 * @returns {Promise<object|null>} contract `PaymentSummary`, or null when absent
 */
async function paymentSummaryFor(paymentRepository, requestId) {
  if (!paymentRepository || requestId === null || requestId === undefined) return null;
  const row = await paymentRepository.findByRequestId(requestId);
  return row ? buildTowPaymentDto(row) : null;
}

/**
 * @param {object|null} paymentRepository
 * @param {Array<unknown>} requestIds
 * @returns {Promise<Map<string, object>>} keyed by `String(request_id)`, only for
 *   requests that actually have a payment row
 */
async function paymentSummariesFor(paymentRepository, requestIds) {
  const map = new Map();
  if (!paymentRepository || !Array.isArray(requestIds) || requestIds.length === 0) return map;

  const rows = await paymentRepository.findByRequestIds(requestIds);
  for (const row of rows) {
    map.set(String(row.tow_request_id), buildTowPaymentDto(row));
  }
  return map;
}

module.exports = { paymentSummaryFor, paymentSummariesFor };
