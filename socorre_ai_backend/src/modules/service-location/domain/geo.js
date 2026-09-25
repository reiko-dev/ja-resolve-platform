/**
 * SERVICE LOCATION — canonical geographic invariants (platform reuse).
 *
 * The WGS84 range rule, the `(0,0)` "null island" sentinel and the operational
 * coordinate assertion are OWNED by `modules/tow/domain/geo.js` and pinned as a
 * single owner by the Tow architecture suite. Phase 5 explicitly forbids
 * duplicating them, so this file is a deliberate one-way re-export instead of a
 * copy: `service-location` reads them, the Tow module never imports back.
 */
'use strict';

module.exports = require('../../tow/domain/geo');
