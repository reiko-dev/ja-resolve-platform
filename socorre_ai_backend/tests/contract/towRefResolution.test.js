/**
 * T00 — `$ref` resolution must fail closed (Muse final review P2-1).
 *
 * The pre-fix resolver did the conceptual equivalent of
 *   `const doc = targetFile === BASE_FILE ? docs.base : docs.canonical;`
 * so ANY third file silently resolved against the canonical document. That is
 * fail-open: a pointer that collides with a canonical component returns the
 * canonical content, and a pointer that does not collide is reported as
 * "missing" even though the referenced file defines it.
 *
 * These tests pin the corrected behaviour:
 *   1. a colliding pointer in a third file resolves to the THIRD file's content;
 *   2. any other pointer in that file resolves there too (never canonical);
 *   3. a missing file still fails closed (`target_file_missing`);
 *   4. a remote ref still fails closed (`remote_ref_not_allowed`);
 *   5. a path outside docs/tow fails closed (`ref_path_outside_docs_tow`);
 *   6. an unparseable file fails closed (`target_file_unreadable`);
 *   7. an internal `#/...` ref inside the third file resolves against that file;
 *   8. the real contract is unaffected (same report as before the fix).
 *
 * The probe file is a dotfile inside docs/tow so no glob over `*.yaml` picks it
 * up, and it is removed in `afterAll` (nothing temporary is left behind).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const {
  BASE_FILE,
  CANONICAL_FILE,
  DOCS_TOW_DIR,
  loadRawDocuments,
  resolveRef,
  validateContract,
} = require('../helpers/towContract');

const PROBE_FILE = '.t00-third-ref-probe.yaml';
const UNPARSEABLE_FILE = '.t00-third-ref-probe-broken.yaml';
const MISSING_FILE = '.t00-third-ref-probe-absent.yaml';
const PROBE_PATH = path.join(DOCS_TOW_DIR, PROBE_FILE);
const UNPARSEABLE_PATH = path.join(DOCS_TOW_DIR, UNPARSEABLE_FILE);

const PROBE_DOCUMENT = [
  'components:',
  '  schemas:',
  '    TowSettingsPatch:',
  '      type: object',
  '      additionalProperties: false',
  '      minProperties: 1',
  '      x-t00-third-file-probe: true',
  '      properties:',
  '        only_in_third_file: { type: string }',
  '    PartnerTowStatus:',
  '      type: string',
  "      enum: ['THIRD_FILE_PARTNER_STATUS']",
  '    TowRequestState:',
  '      type: string',
  "      enum: ['THIRD_FILE_ONLY']",
  '    ThirdFileOnlyProbe:',
  '      type: string',
  "      const: third-file-value",
  '',
].join('\n');

function removeProbeFiles() {
  for (const filePath of [PROBE_PATH, UNPARSEABLE_PATH]) {
    fs.rmSync(filePath, { force: true });
  }
}

describe('Tow $ref resolution — third files are never aliased to canonical (P2-1)', () => {
  const documents = loadRawDocuments();

  beforeAll(() => {
    removeProbeFiles();
    fs.writeFileSync(PROBE_PATH, PROBE_DOCUMENT, 'utf8');
    // Invalid YAML: the resolver must fail closed instead of guessing.
    fs.writeFileSync(UNPARSEABLE_PATH, 'components: [unterminated\n', 'utf8');
  });

  afterAll(() => {
    removeProbeFiles();
  });

  test('the probe file is a real third file: it is not canonical and not base', () => {
    expect(PROBE_FILE).not.toBe(CANONICAL_FILE);
    expect(PROBE_FILE).not.toBe(BASE_FILE);
    expect(fs.existsSync(PROBE_PATH)).toBe(true);
    // The collision is real: canonical DOES define TowSettingsPatch with
    // different content, so an aliasing resolver would be caught below.
    expect(documents.canonical.components.schemas.TowSettingsPatch).toBeDefined();
    expect(documents.canonical.components.schemas.TowSettingsPatch.properties)
      .toHaveProperty('tow_max_radius_km');
  });

  test('case 1 — a colliding pointer resolves to the third file, never to canonical', () => {
    const ref = `./${PROBE_FILE}#/components/schemas/TowSettingsPatch`;
    const resolved = resolveRef(ref, CANONICAL_FILE, documents);

    expect(resolved.found).toBe(true);
    expect(resolved.reason).toBeNull();
    expect(resolved.targetFile).toBe(PROBE_FILE);
    expect(resolved.value['x-t00-third-file-probe']).toBe(true);
    expect(resolved.value.properties).toHaveProperty('only_in_third_file');
    // The fail-open pre-fix behaviour is explicitly excluded:
    expect(resolved.value.properties).not.toHaveProperty('tow_max_radius_km');
    expect(resolved.value).not.toEqual(documents.canonical.components.schemas.TowSettingsPatch);
  });

  test('case 2 — another pointer in the same file is not redirected to canonical either', () => {
    // (a) A schema the CANONICAL document also defines, with different content:
    //     the pre-fix resolver returned the canonical enum here.
    const canonicalCollision = resolveRef(
      `./${PROBE_FILE}#/components/schemas/PartnerTowStatus`,
      CANONICAL_FILE,
      documents
    );
    expect(canonicalCollision.found).toBe(true);
    expect(canonicalCollision.targetFile).toBe(PROBE_FILE);
    expect(canonicalCollision.value.enum).toEqual(['THIRD_FILE_PARTNER_STATUS']);
    expect(documents.canonical.components.schemas.PartnerTowStatus).toBeDefined();
    expect(canonicalCollision.value.enum).not.toEqual(
      documents.canonical.components.schemas.PartnerTowStatus.enum
    );

    // (b) A schema only the BASE document defines: the pre-fix resolver looked
    //     in canonical and reported `pointer_not_found`.
    const baseCollision = resolveRef(
      `./${PROBE_FILE}#/components/schemas/TowRequestState`,
      CANONICAL_FILE,
      documents
    );
    expect(baseCollision.found).toBe(true);
    expect(baseCollision.targetFile).toBe(PROBE_FILE);
    expect(baseCollision.value.enum).toEqual(['THIRD_FILE_ONLY']);
    expect(documents.base.components.schemas.TowRequestState.enum).not.toEqual(['THIRD_FILE_ONLY']);

    // (c) A schema that exists ONLY in the third file resolves there as well.
    const onlyThird = resolveRef(
      `./${PROBE_FILE}#/components/schemas/ThirdFileOnlyProbe`,
      CANONICAL_FILE,
      documents
    );
    expect(onlyThird.found).toBe(true);
    expect(onlyThird.value.const).toBe('third-file-value');
  });

  test('case 3 — a missing third file still fails closed', () => {
    const resolved = resolveRef(`./${MISSING_FILE}#/components/schemas/Anything`, CANONICAL_FILE, documents);
    expect(resolved.found).toBe(false);
    expect(resolved.reason).toBe('target_file_missing');
    expect(resolved.value).toBeUndefined();
  });

  test('case 4 — an existing third file with an absent pointer fails closed', () => {
    const resolved = resolveRef(
      `./${PROBE_FILE}#/components/schemas/DoesNotExist`,
      CANONICAL_FILE,
      documents
    );
    expect(resolved.found).toBe(false);
    expect(resolved.reason).toBe('pointer_not_found');
  });

  test('case 5 — a remote ref fails closed', () => {
    for (const ref of [
      'https://example.com/tow.yaml#/components/schemas/TowSettingsPatch',
      'http://example.com/tow.yaml#/components/schemas/TowSettingsPatch',
    ]) {
      const resolved = resolveRef(ref, CANONICAL_FILE, documents);
      expect(resolved.found).toBe(false);
      expect(resolved.reason).toBe('remote_ref_not_allowed');
    }
  });

  test('case 6 — a ref path outside docs/tow fails closed instead of being rewritten', () => {
    for (const ref of [
      '../../../package.json#/name',
      '/etc/passwd#/x',
      'nested/dir/file.yaml#/x',
      '..\\windows.yaml#/x',
    ]) {
      const resolved = resolveRef(ref, CANONICAL_FILE, documents);
      expect(resolved.found).toBe(false);
      expect(resolved.reason).toBe('ref_path_outside_docs_tow');
    }
  });

  test('case 7 — an unparseable third file fails closed', () => {
    const resolved = resolveRef(
      `./${UNPARSEABLE_FILE}#/components/schemas/Anything`,
      CANONICAL_FILE,
      documents
    );
    expect(resolved.found).toBe(false);
    expect(resolved.reason).toBe('target_file_unreadable');
    expect(typeof resolved.error).toBe('string');
  });

  test('case 8 — an internal ref inside the third file resolves against the third file', () => {
    const resolved = resolveRef('#/components/schemas/ThirdFileOnlyProbe', PROBE_FILE, documents);
    expect(resolved.found).toBe(true);
    expect(resolved.targetFile).toBe(PROBE_FILE);
    expect(resolved.value.const).toBe('third-file-value');
  });

  test('case 9 — the real contract is unaffected by the resolver change', () => {
    const report = validateContract({ documents });
    expect(report.ok).toBe(true);
    expect(report.refs.unresolved).toEqual([]);
    expect(report.refs.checked).toBeGreaterThan(0);
    // The real documents never reference the probe file.
    expect(JSON.stringify(documents)).not.toContain(PROBE_FILE);
    // The base ref still resolves through the in-memory document (mutation
    // probes and the composition rely on caller-supplied documents winning).
    const mutated = JSON.parse(JSON.stringify(documents));
    mutated.base.components.schemas.TowSettings.required = ['tow_max_radius_km'];
    const mutatedResolved = resolveRef(
      `./${BASE_FILE}#/components/schemas/TowSettings`,
      CANONICAL_FILE,
      mutated
    );
    expect(mutatedResolved.found).toBe(true);
    expect(mutatedResolved.value.required).toEqual(['tow_max_radius_km']);
  });
});
