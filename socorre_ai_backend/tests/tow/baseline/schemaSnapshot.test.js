/**
 * T01 — determinism of the schema snapshot used to prove that the baseline
 * reproduces the same schema on every fresh database.
 *
 * The snapshot is the evidence mechanism of the MIGRATION suite, so it has to
 * be order-independent, name-aware where it matters, and stable across runs.
 * These tests are offline and use small synthetic snapshots.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  parsePgArray,
  canonicalize,
  fingerprintOf,
  compareSnapshots,
  formatComparison,
} = require('../../../scripts/tow/schema-snapshot');

/** Minimal snapshot with one table. */
function snapshotWith(overrides = {}) {
  const table = {
    columns: [
      { name: 'id', type: 'integer', nullable: false, default: "nextval('t_id_seq'::regclass)", identity: null },
      { name: 'email', type: 'character varying(100)', nullable: false, default: null, identity: null },
    ],
    primaryKey: { name: 't_pkey', columns: ['id'] },
    foreignKeys: [
      { name: 't_user_id_foreign', columns: ['user_id'], references: { table: 'users', columns: ['id'] }, onDelete: 'CASCADE', onUpdate: 'NO ACTION' },
    ],
    uniqueConstraints: [{ name: 't_email_unique', columns: ['email'] }],
    checks: [{ name: 't_role_check', definition: "CHECK ((role = ANY (ARRAY['user'::text])))" }],
    indexes: [{ name: 't_email_index', definition: 'CREATE INDEX t_email_index ON public.t USING btree (email)', unique: false }],
    ...overrides,
  };
  const snapshot = {
    counts: { tables: 1, columns: table.columns.length, foreignKeys: table.foreignKeys.length },
    tables: { t: table },
    enums: {},
    sequences: [{ name: 't_id_seq', table: 't', column: 'id' }],
  };
  snapshot.fingerprint = fingerprintOf(snapshot);
  return snapshot;
}

describe('T01 MIGRATION — schema snapshot determinism', () => {
  describe('parsePgArray', () => {
    test('normalizes the text[] literal returned by node-pg', () => {
      expect(parsePgArray('{id}')).toEqual(['id']);
      expect(parsePgArray('{a,b,c}')).toEqual(['a', 'b', 'c']);
      expect(parsePgArray('{}')).toEqual([]);
      expect(parsePgArray('{"a,b",c}')).toEqual(['a,b', 'c']);
      expect(parsePgArray(null)).toEqual([]);
      expect(parsePgArray(['already', 'array'])).toEqual(['already', 'array']);
    });
  });

  describe('canonicalize / fingerprintOf', () => {
    test('is independent of object key order', () => {
      const left = { b: 1, a: { d: [1, 2], c: 3 } };
      const right = { a: { c: 3, d: [1, 2] }, b: 1 };
      expect(canonicalize(left)).toEqual(canonicalize(right));
      expect(fingerprintOf(left)).toBe(fingerprintOf(right));
    });

    test('changes when any value changes', () => {
      const base = snapshotWith();
      const changed = snapshotWith({
        columns: [
          { name: 'id', type: 'integer', nullable: false, default: null, identity: null },
          { name: 'email', type: 'character varying(100)', nullable: false, default: null, identity: null },
        ],
      });
      expect(fingerprintOf(changed)).not.toBe(fingerprintOf(base));
    });

    test('is stable across repeated computations', () => {
      const snapshot = snapshotWith();
      expect(fingerprintOf(snapshot)).toBe(fingerprintOf(JSON.parse(JSON.stringify(snapshot))));
    });

    test('ignores the stored fingerprint key, so recomputation is idempotent', () => {
      // `snapshotSchema` stores its fingerprint in the snapshot; recomputing it
      // (as the gate and the evidence comparison do) must yield the same value.
      const snapshot = snapshotWith();
      expect(snapshot.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(fingerprintOf(snapshot)).toBe(snapshot.fingerprint);
    });
  });

  describe('compareSnapshots', () => {
    test('reports equality for identical snapshots', () => {
      const snapshot = snapshotWith();
      const comparison = compareSnapshots(snapshot, JSON.parse(JSON.stringify(snapshot)));
      expect(comparison.equal).toBe(true);
      expect(comparison.sameFingerprint).toBe(true);
      expect(comparison.changes).toEqual([]);
      expect(formatComparison(comparison)).toMatch(/IDENTICAL/);
    });

    test('matches constraints by definition: a pure rename is one change, not two', () => {
      const left = snapshotWith();
      const right = snapshotWith({
        foreignKeys: [
          { name: 't_user_id_foreign_renamed', columns: ['user_id'], references: { table: 'users', columns: ['id'] }, onDelete: 'CASCADE', onUpdate: 'NO ACTION' },
        ],
      });
      // Name-insensitive matching: the two entries are the same constraint, so
      // the rename is reported as a single change (never as remove + add).
      const byDefinition = compareSnapshots(left, right);
      expect(byDefinition.changes.map((change) => `${change.kind}:${change.change}:${change.name}`))
        .toEqual(['foreignKeys:changed:t_user_id_foreign']);
      // `--strict-names` treats the names as part of the identity.
      const strict = compareSnapshots(left, right, { ignoreConstraintNames: false });
      expect(strict.equal).toBe(false);
      expect(strict.changes.map((change) => `${change.change}:${change.name}`).sort())
        .toEqual(['added:t_user_id_foreign_renamed', 'removed:t_user_id_foreign']);
    });

    test('detects a removed index (the redundancy delta of T01)', () => {
      const left = snapshotWith();
      const right = snapshotWith({ indexes: [] });
      const comparison = compareSnapshots(left, right);
      expect(comparison.equal).toBe(false);
      expect(comparison.changes).toEqual([
        { kind: 'indexes', change: 'removed', name: 't_email_index', detail: expect.any(String) },
      ]);
      expect(formatComparison(comparison)).toMatch(/REMOVED indexes t_email_index/);
    });

    test('detects a removed foreign key (the referential-integrity delta of T01)', () => {
      const left = snapshotWith();
      const right = snapshotWith({ foreignKeys: [] });
      const comparison = compareSnapshots(left, right);
      expect(comparison.equal).toBe(false);
      expect(comparison.changes.map((change) => change.kind)).toContain('foreignKeys');
    });

    test('detects added/removed tables and changed sequences', () => {
      const left = snapshotWith();
      const right = snapshotWith();
      right.tables.other = right.tables.t;
      delete right.tables.t;
      right.sequences = [];
      const comparison = compareSnapshots(left, right);
      expect(comparison.equal).toBe(false);
      const kinds = comparison.changes.map((change) => `${change.kind}:${change.change}`);
      expect(kinds).toContain('table:added');
      expect(kinds).toContain('table:removed');
      expect(kinds).toContain('sequence:removed');
    });
  });

  describe('evidence files of this task', () => {
    const evidenceDir = path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'evidence', 't01');

    test('the baseline snapshot differs from the legacy chain ONLY by the documented deltas', () => {
      const legacyPath = path.join(evidenceDir, 'schema-legacy-chain.json');
      const baselinePath = path.join(evidenceDir, 'schema-baseline.json');
      if (!fs.existsSync(legacyPath) || !fs.existsSync(baselinePath)) {
        // Evidence is produced by the gate/audit steps; skip when absent.
        return;
      }
      const comparison = compareSnapshots(
        JSON.parse(fs.readFileSync(legacyPath, 'utf8')),
        JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
      );
      expect(comparison.equal).toBe(false);
      const summary = comparison.changes
        .map((change) => `${change.change} ${change.kind} ${change.name}`)
        .sort();
      expect(summary).toEqual([
        'added foreignKeys wallet_transactions_dispute_id_foreign',
        'added indexes wallet_transactions_dispute_id_index',
        'removed indexes products_sku_index',
        'removed indexes system_settings_setting_key_index',
        'removed indexes user_documents_user_id_document_type_index',
        'removed indexes wallets_partner_id_index',
        'removed indexes wallets_user_id_index',
      ]);
    });
  });
});
