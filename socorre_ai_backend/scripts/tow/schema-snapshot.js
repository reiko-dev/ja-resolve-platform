#!/usr/bin/env node
/**
 * T01 — deterministic PostgreSQL schema snapshot.
 *
 * WHY: the T01 baseline must be proven EQUIVALENT to the legacy migration chain
 * (docs/tow/T01-DATABASE-BASELINE-DECISION.md), and the clean-database gate must
 * prove that two independent fresh runs produce the SAME schema. Both need a
 * canonical, order-independent description of the schema that can be diffed.
 *
 * WHAT IT READS (catalog only, never data):
 *   - tables + columns (type, nullability, default, identity/generated);
 *   - primary keys, foreign keys (with ON DELETE), unique constraints, checks;
 *   - every index (unique/partial/expression) with its definition;
 *   - enum types and their labels (migration 008/030 create one);
 *   - sequences (serial/identity backing objects).
 *
 * DETERMINISM: every collection is sorted by name and every definition string is
 * whitespace-normalized, so the JSON is byte-stable across runs and connections.
 * `fingerprint` is the sha256 of the canonical JSON: two snapshots with the same
 * fingerprint are the same schema.
 *
 * SAFETY: reading the catalog is not destructive, but the CLI still resolves its
 * target through the T00 guard (`pg-guard`/test-env) and refuses a non-loopback,
 * non-`_test` target unless an explicit connection object is injected.
 *
 * Usage:
 *   node scripts/tow/schema-snapshot.js --out docs/evidence/t01/schema.json
 *   node scripts/tow/schema-snapshot.js --compare a.json b.json
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COLUMNS_SQL = `
  SELECT table_name, column_name, ordinal_position,
         data_type, udt_name, character_maximum_length, numeric_precision, numeric_scale,
         is_nullable, column_default, is_identity, is_generated
    FROM information_schema.columns
   WHERE table_schema = 'public'
   ORDER BY table_name, ordinal_position`;

const CONSTRAINTS_SQL = `
  SELECT c.conname AS name, c.contype AS type, t.relname AS table_name,
         c.condeferrable AS deferrable, c.convalidated AS validated,
         pg_get_constraintdef(c.oid) AS definition,
         ARRAY(
           SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
            ORDER BY k.ord
         ) AS columns,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'table', rt.relname, 'column', ra.attname, 'ord', k.ord) ORDER BY k.ord)
             FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
             JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = k.attnum
             JOIN pg_class rt ON rt.oid = c.confrelid
         ), '[]'::json) AS references
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public' AND c.contype IN ('p', 'f', 'u', 'c')
   ORDER BY t.relname, c.conname`;

const INDEXES_SQL = `
  SELECT i.relname AS name, t.relname AS table_name, x.indisunique AS is_unique,
         x.indisprimary AS is_primary, pg_get_indexdef(x.indexrelid) AS definition
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public'
   ORDER BY t.relname, i.relname`;

const ENUMS_SQL = `
  SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public'
   GROUP BY t.typname
   ORDER BY t.typname`;

const SEQUENCES_SQL = `
  SELECT sequencename AS name, data_type, start_value, increment_by, min_value, max_value, cycle
    FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename`;

/** Collapse whitespace so `CHECK ((x > 0))` and `CHECK ((x > 0))\n` compare equal. */
function normalizeSql(value) {
  if (value === null || value === undefined) return null;
  return String(value).replace(/\s+/g, ' ').trim();
}

/**
 * node-pg does not always decode a `text[]` produced by `ARRAY(subquery)` into a
 * JS array (it can arrive as the `{a,b}` literal). Normalize both shapes so the
 * snapshot is stable regardless of the driver's decoding.
 */
function parsePgArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  const text = String(value).trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return [text];
  const inner = text.slice(1, -1);
  if (inner === '') return [];
  const items = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (quoted) {
      if (char === '"') {
        if (inner[index + 1] === '"') { current += '"'; index += 1; } else { quoted = false; }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      items.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  items.push(current);
  return items.map((item) => (item === 'NULL' ? null : item));
}

/** Deterministic JSON: object keys sorted recursively (arrays keep their order). */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

function fingerprintOf(snapshot) {
  // The `fingerprint` key itself is never part of the hash, so recomputing the
  // fingerprint of an already fingerprinted snapshot is idempotent (and matches
  // the value `snapshotSchema` stored in it).
  const { fingerprint, ...rest } = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(rest))).digest('hex');
}

/** Read the whole schema from a live connection and return the canonical object. */
async function snapshotSchema(db) {
  const [columns, constraints, indexes, enums, sequences] = await Promise.all([
    db.raw(COLUMNS_SQL),
    db.raw(CONSTRAINTS_SQL),
    db.raw(INDEXES_SQL),
    db.raw(ENUMS_SQL),
    db.raw(SEQUENCES_SQL),
  ]);

  const tables = {};
  const table = (name) => {
    if (!tables[name]) {
      tables[name] = {
        columns: [],
        primaryKey: null,
        foreignKeys: [],
        uniqueConstraints: [],
        checks: [],
        indexes: [],
      };
    }
    return tables[name];
  };

  for (const row of columns.rows) {
    table(row.table_name).columns.push({
      name: row.column_name,
      type: row.data_type === 'USER-DEFINED' ? row.udt_name : row.data_type,
      maxLength: row.character_maximum_length === null ? null : Number(row.character_maximum_length),
      precision: row.numeric_precision === null ? null : Number(row.numeric_precision),
      scale: row.numeric_scale === null ? null : Number(row.numeric_scale),
      nullable: row.is_nullable === 'YES',
      default: normalizeSql(row.column_default),
      identity: row.is_identity === 'YES',
      generated: row.is_generated === 'ALWAYS',
    });
  }

  for (const row of constraints.rows) {
    const entry = table(row.table_name);
    const definition = normalizeSql(row.definition);
    const constraintColumns = parsePgArray(row.columns);
    if (row.type === 'p') {
      entry.primaryKey = { name: row.name, columns: constraintColumns, definition };
    } else if (row.type === 'f') {
      entry.foreignKeys.push({
        name: row.name,
        columns: constraintColumns,
        references: (Array.isArray(row.references) ? row.references : JSON.parse(row.references))
          .map((ref) => ({ table: ref.table, column: ref.column })),
        onDelete: /ON DELETE ([A-Z ]+)/.exec(definition)?.[1]?.trim() || 'NO ACTION',
        definition,
      });
    } else if (row.type === 'u') {
      entry.uniqueConstraints.push({ name: row.name, columns: constraintColumns, definition });
    } else {
      entry.checks.push({ name: row.name, columns: constraintColumns, definition });
    }
  }

  for (const row of indexes.rows) {
    table(row.table_name).indexes.push({
      name: row.name,
      unique: row.is_unique,
      primary: row.is_primary,
      definition: normalizeSql(row.definition),
    });
  }

  const enumTypes = {};
  for (const row of enums.rows) enumTypes[row.name] = parsePgArray(row.labels);

  const sequenceList = {};
  for (const row of sequences.rows) {
    sequenceList[row.name] = {
      dataType: row.data_type,
      start: String(row.start_value),
      increment: String(row.increment_by),
      min: String(row.min_value),
      max: String(row.max_value),
      cycle: row.cycle,
    };
  }

  const snapshot = {
    tables,
    enums: enumTypes,
    sequences: sequenceList,
    counts: {
      tables: Object.keys(tables).length,
      columns: Object.values(tables).reduce((sum, t) => sum + t.columns.length, 0),
      foreignKeys: Object.values(tables).reduce((sum, t) => sum + t.foreignKeys.length, 0),
      uniqueConstraints: Object.values(tables).reduce((sum, t) => sum + t.uniqueConstraints.length, 0),
      checks: Object.values(tables).reduce((sum, t) => sum + t.checks.length, 0),
      indexes: Object.values(tables).reduce((sum, t) => sum + t.indexes.length, 0),
      enums: Object.keys(enumTypes).length,
      sequences: Object.keys(sequenceList).length,
    },
  };
  snapshot.fingerprint = fingerprintOf(snapshot);
  return snapshot;
}

/** Signature of an object ignoring its generated NAME (semantic comparison). */
function signatureOf(kind, entry) {
  if (kind === 'columns') {
    return [
      entry.name,
      entry.type,
      entry.maxLength ?? '',
      entry.nullable ? 'null' : 'not-null',
      entry.default ?? '',
      entry.identity ? 'identity' : '',
      entry.generated ? 'generated' : '',
    ].join('|');
  }
  return JSON.stringify([kind, entry.columns ?? [], entry.references ?? [], entry.definition ?? entry.definition]);
}

function diffEntries(kind, left = [], right = [], { ignoreNames }) {
  const keyOf = (entry) => (ignoreNames ? signatureOf(kind, entry) : entry.name);
  const leftMap = new Map(left.map((entry) => [keyOf(entry), entry]));
  const rightMap = new Map(right.map((entry) => [keyOf(entry), entry]));
  const changes = [];
  for (const [key, entry] of leftMap) {
    if (!rightMap.has(key)) {
      changes.push({ kind, change: 'removed', name: entry.name, detail: entry.definition ?? signatureOf(kind, entry) });
    } else if (JSON.stringify(canonicalize(entry)) !== JSON.stringify(canonicalize(rightMap.get(key)))) {
      changes.push({
        kind,
        change: 'changed',
        name: entry.name,
        left: entry.definition ?? signatureOf(kind, entry),
        right: rightMap.get(key).definition ?? signatureOf(kind, rightMap.get(key)),
      });
    }
  }
  for (const [key, entry] of rightMap) {
    if (!leftMap.has(key)) {
      changes.push({ kind, change: 'added', name: entry.name, detail: entry.definition ?? signatureOf(kind, entry) });
    }
  }
  return changes;
}

/**
 * Compare two snapshots.
 * @param {object} left
 * @param {object} right
 * @param {{ignoreConstraintNames?: boolean}} options
 */
function compareSnapshots(left, right, options = {}) {
  const ignoreConstraintNames = options.ignoreConstraintNames !== false;
  const changes = [];
  const tableNames = new Set([...Object.keys(left.tables), ...Object.keys(right.tables)]);
  for (const name of [...tableNames].sort()) {
    const a = left.tables[name];
    const b = right.tables[name];
    if (!a) { changes.push({ kind: 'table', change: 'added', name }); continue; }
    if (!b) { changes.push({ kind: 'table', change: 'removed', name }); continue; }
    changes.push(...diffEntries('columns', a.columns, b.columns, { ignoreNames: false }));
    changes.push(...diffEntries('primaryKey', a.primaryKey ? [a.primaryKey] : [], b.primaryKey ? [b.primaryKey] : [], { ignoreNames: ignoreConstraintNames }));
    changes.push(...diffEntries('foreignKeys', a.foreignKeys, b.foreignKeys, { ignoreNames: ignoreConstraintNames }));
    changes.push(...diffEntries('uniqueConstraints', a.uniqueConstraints, b.uniqueConstraints, { ignoreNames: ignoreConstraintNames }));
    changes.push(...diffEntries('checks', a.checks, b.checks, { ignoreNames: ignoreConstraintNames }));
    changes.push(...diffEntries('indexes', a.indexes, b.indexes, { ignoreNames: ignoreConstraintNames }));
  }
  for (const name of new Set([...Object.keys(left.enums), ...Object.keys(right.enums)])) {
    const a = left.enums[name];
    const b = right.enums[name];
    if (!a) changes.push({ kind: 'enum', change: 'added', name });
    else if (!b) changes.push({ kind: 'enum', change: 'removed', name });
    else if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ kind: 'enum', change: 'changed', name, left: a, right: b });
  }
  for (const name of new Set([...Object.keys(left.sequences), ...Object.keys(right.sequences)])) {
    const a = left.sequences[name];
    const b = right.sequences[name];
    if (!a) changes.push({ kind: 'sequence', change: 'added', name });
    else if (!b) changes.push({ kind: 'sequence', change: 'removed', name });
    else if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ kind: 'sequence', change: 'changed', name, left: a, right: b });
  }
  return {
    equal: changes.length === 0,
    sameFingerprint: left.fingerprint === right.fingerprint,
    changes,
  };
}

function formatComparison(comparison) {
  const lines = [];
  lines.push(`fingerprints: ${comparison.sameFingerprint ? 'IDENTICAL' : 'DIFFERENT'}`);
  if (comparison.equal) {
    lines.push('semantic diff: EMPTY (schemas are equivalent)');
    return lines.join('\n');
  }
  lines.push(`semantic diff: ${comparison.changes.length} change(s)`);
  for (const change of comparison.changes) {
    const detail = change.detail ? ` — ${change.detail}` : '';
    const both = change.left !== undefined ? ` — left=${JSON.stringify(change.left)} right=${JSON.stringify(change.right)}` : '';
    lines.push(`  ${change.change.toUpperCase()} ${change.kind} ${change.name}${detail}${both}`);
  }
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const valueOf = (flag) => {
    const index = args.indexOf(flag);
    return index === -1 ? null : args[index + 1];
  };

  const compareIndex = args.indexOf('--compare');
  if (compareIndex !== -1) {
    const [leftPath, rightPath] = args.slice(compareIndex + 1, compareIndex + 3);
    if (!leftPath || !rightPath) {
      console.error('usage: schema-snapshot.js --compare <left.json> <right.json> [--strict-names]');
      process.exit(2);
    }
    const comparison = compareSnapshots(
      JSON.parse(fs.readFileSync(leftPath, 'utf8')),
      JSON.parse(fs.readFileSync(rightPath, 'utf8')),
      { ignoreConstraintNames: !args.includes('--strict-names') }
    );
    console.log(formatComparison(comparison));
    process.exitCode = comparison.equal ? 0 : 1;
    return;
  }

  const postgres = require('../../tests/helpers/tow/postgres');
  const db = postgres.createConnection();
  try {
    const snapshot = await snapshotSchema(db);
    const out = valueOf('--out');
    if (out) {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(path.resolve(out), `${JSON.stringify(snapshot, null, 2)}\n`);
      console.log(`schema snapshot written to ${out}`);
    }
    console.log(`target: ${postgres.targetDescription()}`);
    console.log(`tables=${snapshot.counts.tables} columns=${snapshot.counts.columns} ` +
      `fks=${snapshot.counts.foreignKeys} uniques=${snapshot.counts.uniqueConstraints} ` +
      `checks=${snapshot.counts.checks} indexes=${snapshot.counts.indexes} ` +
      `enums=${snapshot.counts.enums} sequences=${snapshot.counts.sequences}`);
    console.log(`fingerprint: ${snapshot.fingerprint}`);
  } finally {
    await db.destroy();
  }
}

module.exports = {
  parsePgArray,
  snapshotSchema,
  compareSnapshots,
  formatComparison,
  canonicalize,
  fingerprintOf,
  normalizeSql,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`schema-snapshot failed: ${error && error.message ? error.message : error}`);
    process.exit(1);
  });
}
