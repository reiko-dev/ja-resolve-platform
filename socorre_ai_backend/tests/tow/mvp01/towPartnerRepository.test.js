/**
 * MVP-01 EXT — UNIT/integration suite for the `PartnerRepository` port adapter.
 *
 * EXT-MVP01-2 central eligibility must know the partner identity without the
 * domain/application depending on the legacy `Partner` model or Knex. This
 * suite proves the adapter returns only the `{ id, type }` projection and null
 * for a missing partner.
 *
 * RED-first: written before `partner-repository` exists.
 */
'use strict';

jest.mock('../../../src/config/database', () => require('../../helpers/testDb').db);

const testDb = require('../../helpers/testDb');
const { createPartnerRepository } = require('../../../src/modules/tow/adapters/persistence/partner-repository');

describe('MVP-01 EXT — partner repository port adapter', () => {
  let repository;

  beforeAll(async () => {
    await testDb.reset();
    repository = createPartnerRepository(testDb.db);
  });

  afterAll(async () => {
    await testDb.reset();
  });

  test('findById returns the id/type projection plus the MVP-03 operational location', async () => {
    const user = await testDb.createUser({ role: 'partner' });
    const partner = await testDb.createPartner({
      user_id: user.id,
      type: 'tow',
      latitude: -23.561684,
      longitude: -46.655981,
      is_available: 1,
      is_online: 1,
      is_verified: 1,
    });

    const found = await repository.findById(partner.id);
    // MVP-01 contract, unchanged: the identity fields are exactly these.
    expect(found).toMatchObject({ id: partner.id, type: 'tow' });
    // MVP-03 extension: geographic matching reads the partner's operational
    // location and availability through the same port, so `findById` now
    // projects those columns too (nullable in the schema, coerced to
    // booleans/numbers by the adapter).
    expect(found).toMatchObject({
      is_available: true,
      is_online: true,
      is_verified: true,
      latitude: -23.561684,
      longitude: -46.655981,
    });
  });

  test('findById returns null for a missing partner', async () => {
    await expect(repository.findById(999999)).resolves.toBeNull();
  });

  test('requires a knex instance', () => {
    expect(() => createPartnerRepository()).toThrow(TypeError);
  });
});
