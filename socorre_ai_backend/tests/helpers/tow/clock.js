/**
 * T00 — deterministic fake clock for the Tow test foundation.
 *
 * SCOPE AND LIMITS (read before use)
 * ----------------------------------
 * This clock controls **JavaScript time only**:
 *   - `Date.now()`, `new Date()` inside the process (when installed);
 *   - timers scheduled with `setTimeout` / `setInterval` (when installed).
 *
 * It does **NOT** control:
 *   - PostgreSQL `NOW()`, `CURRENT_TIMESTAMP`, `knex.fn.now()` or column
 *     defaults evaluated by the database;
 *   - `statement_timestamp()` / transaction time;
 *   - the real wall clock of any external process.
 *
 * Tests that assert on database-generated timestamps MUST either inject the
 * timestamp explicitly (write the value under test) or read the DB clock, never
 * assume this fake clock changed it. See docs/tow/TOW-DOCKER-TEST-STRATEGY.md.
 *
 * Usage (pure, no globals mutated — preferred):
 *   const clock = createFakeClock('2026-01-15T12:00:00.000Z');
 *   clock.isoNow();            // '2026-01-15T12:00:00.000Z'
 *   clock.advanceMinutes(15);  // moves the injectable clock forward
 *
 * Usage (Jest fake timers — opt-in per test file):
 *   clock.install();           // jest.useFakeTimers({ now })
 *   clock.advanceSeconds(30);  // jest.advanceTimersByTime
 *   clock.restore();           // jest.useRealTimers
 */
'use strict';

const DEFAULT_START = '2026-01-15T12:00:00.000Z';

class TowFakeClock {
  constructor(start = DEFAULT_START) {
    this.startMs = start instanceof Date ? start.getTime() : Date.parse(start);
    if (Number.isNaN(this.startMs)) {
      throw new TypeError(`TowFakeClock: invalid start value: ${String(start)}`);
    }
    this.currentMs = this.startMs;
    this.installed = false;
  }

  nowMs() {
    return this.currentMs;
  }

  now() {
    return new Date(this.currentMs);
  }

  isoNow() {
    return new Date(this.currentMs).toISOString();
  }

  /** Deterministic `Date` factory: every call returns the same frozen instant. */
  dateFactory() {
    return this.now();
  }

  advance(ms) {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new TypeError(`TowFakeClock.advance: expected a non-negative number, got ${String(ms)}`);
    }
    this.currentMs += ms;
    if (this.installed) {
      jest.advanceTimersByTime(ms);
      jest.setSystemTime(this.currentMs);
    }
    return this;
  }

  advanceSeconds(seconds) { return this.advance(seconds * 1000); }
  advanceMinutes(minutes) { return this.advance(minutes * 60 * 1000); }
  advanceHours(hours) { return this.advance(hours * 60 * 60 * 1000); }
  advanceDays(days) { return this.advance(days * 24 * 60 * 60 * 1000); }

  set(instant) {
    const ms = instant instanceof Date ? instant.getTime() : Date.parse(instant);
    if (Number.isNaN(ms)) {
      throw new TypeError(`TowFakeClock.set: invalid instant: ${String(instant)}`);
    }
    const delta = ms - this.currentMs;
    this.currentMs = ms;
    if (this.installed) {
      if (delta > 0) jest.advanceTimersByTime(delta);
      jest.setSystemTime(ms);
    }
    return this;
  }

  reset() {
    this.currentMs = this.startMs;
    if (this.installed) jest.setSystemTime(this.startMs);
    return this;
  }

  /**
   * Install Jest fake timers frozen at the clock's current instant.
   *
   * `queueMicrotask`, `process.nextTick` and `setImmediate` are intentionally
   * NOT faked: faking them breaks promise scheduling used by supertest/express.
   */
  install() {
    if (this.installed) return this;
    if (typeof jest === 'undefined') {
      throw new Error('TowFakeClock.install: jest global is not available');
    }
    jest.useFakeTimers({
      now: this.currentMs,
      doNotFake: [
        'nextTick',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'hrtime',
      ],
    });
    jest.setSystemTime(this.currentMs);
    this.installed = true;
    return this;
  }

  restore() {
    if (!this.installed) return this;
    jest.useRealTimers();
    this.installed = false;
    return this;
  }
}

function createFakeClock(start = DEFAULT_START) {
  return new TowFakeClock(start);
}

module.exports = { TowFakeClock, createFakeClock, DEFAULT_START };
