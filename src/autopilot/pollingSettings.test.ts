import kvdb from '@/kvdb';

import {
  ABSOLUTE_MIN_INTERVAL_MS,
  MAX_INTERVAL_MS,
  POLLING_SETTINGS_KEY,
  POLLING_SPECS,
  cadenceIntervals,
  formatSeconds,
  loadPollingSettings,
  pacingFor,
  parseSeconds,
  resetAllPolling,
  resetPollingRule,
  resolvePolling,
  savePollingRule,
  specFor,
} from './pollingSettings';
import {
  APPROACH_INTERVAL_MS,
  BURST_INTERVAL_MS,
  IDLE_INTERVAL_MS,
  MIN_INTERVAL_MS,
  RAPID_INTERVAL_MS,
  RAPID_MIN_INTERVAL_MS,
  REFILL_INTERVAL_MS,
  TOMORROW_INTERVAL_MS,
  withJitter,
} from './schedule';
import { CYCLE_MS } from './useTimeSearch';

const BUILT_IN: Record<string, number> = {
  nextll: RAPID_INTERVAL_MS,
  timeSearch: CYCLE_MS,
  idle: IDLE_INTERVAL_MS,
  approach: APPROACH_INTERVAL_MS,
  burst: BURST_INTERVAL_MS,
  tomorrow: TOMORROW_INTERVAL_MS,
  refill: REFILL_INTERVAL_MS,
};

beforeEach(() => {
  resetAllPolling();
});

describe('polling defaults', () => {
  it('matches the paces the pollers were built with', () => {
    for (const spec of POLLING_SPECS) {
      const pacing = pacingFor(spec.rule);
      expect(pacing.intervalMs).toBe(BUILT_IN[spec.rule]);
      expect(pacing.intervalMs).toBe(spec.defaultMs);
      expect(pacing.jitterPercent).toBe(spec.defaultJitterPercent);
      expect(pacing.belowFloor).toBe(false);
      expect(pacing.customized).toBe(false);
      expect(pacing.floorMs).toBe(spec.floorMs);
    }
  });

  it('keeps NextLL on the rapid floor and everything else on the ordinary one', () => {
    expect(specFor('nextll').floorMs).toBe(RAPID_MIN_INTERVAL_MS);
    expect(specFor('nextll').defaultJitterPercent).toBe(20);
    for (const spec of POLLING_SPECS) {
      if (spec.rule === 'nextll') continue;
      expect(spec.floorMs).toBe(MIN_INTERVAL_MS);
    }
    expect(specFor('timeSearch').defaultJitterPercent).toBe(0);
  });

  it('does not store anything until a pace is changed', () => {
    expect(loadPollingSettings()).toEqual({});
    expect(kvdb.get(POLLING_SETTINGS_KEY)).toBeUndefined();
  });
});

describe('savePollingRule()', () => {
  it('persists a NextLL interval and jitter and leaves the others alone', () => {
    savePollingRule('nextll', { intervalMs: 1500, jitterPercent: 10 });
    expect(pacingFor('nextll')).toMatchObject({
      intervalMs: 1500,
      jitterPercent: 10,
      jitterFraction: 0.1,
      floorMs: RAPID_MIN_INTERVAL_MS,
      customized: true,
    });
    expect(pacingFor('idle').intervalMs).toBe(IDLE_INTERVAL_MS);
    expect(loadPollingSettings()).toEqual({
      nextll: { intervalMs: 1500, jitterPercent: 10 },
    });
  });

  it('raises an interval under the floor when the override is off', () => {
    const pacing = savePollingRule('nextll', { intervalMs: 100 });
    expect(pacing.intervalMs).toBe(RAPID_MIN_INTERVAL_MS);
    expect(pacing.belowFloor).toBe(false);
    expect(pacing.floorMs).toBe(RAPID_MIN_INTERVAL_MS);
    expect(withJitter(pacing.intervalMs, () => 0, pacing.floorMs, 0)).toBe(
      RAPID_MIN_INTERVAL_MS
    );
  });

  it('allows down to the absolute minimum only with the override', () => {
    const pacing = savePollingRule('nextll', {
      intervalMs: 300,
      jitterPercent: 0,
      belowFloor: true,
    });
    expect(pacing.intervalMs).toBe(300);
    expect(pacing.floorMs).toBe(ABSOLUTE_MIN_INTERVAL_MS);
    expect(
      withJitter(
        pacing.intervalMs,
        () => 0,
        pacing.floorMs,
        pacing.jitterFraction
      )
    ).toBe(300);
  });

  it('will not store a wait under the absolute minimum', () => {
    const pacing = savePollingRule('burst', {
      intervalMs: 1,
      belowFloor: true,
      jitterPercent: 0,
    });
    expect(pacing.intervalMs).toBe(ABSOLUTE_MIN_INTERVAL_MS);
    expect(pacing.floorMs).toBe(ABSOLUTE_MIN_INTERVAL_MS);
  });

  it('caps a very slow interval and a very wide jitter', () => {
    const pacing = savePollingRule('idle', {
      intervalMs: MAX_INTERVAL_MS + 50_000,
      jitterPercent: 90,
    });
    expect(pacing.intervalMs).toBe(MAX_INTERVAL_MS);
    expect(pacing.jitterPercent).toBe(50);
  });

  it('ignores a non-numeric interval and keeps the default', () => {
    savePollingRule('approach', {
      intervalMs: Number.NaN,
      jitterPercent: Number.POSITIVE_INFINITY,
    });
    expect(pacingFor('approach').intervalMs).toBe(APPROACH_INTERVAL_MS);
    expect(pacingFor('approach').jitterPercent).toBe(20);
    expect(kvdb.get(POLLING_SETTINGS_KEY)).toBeUndefined();
  });

  it('drops a rule once it is back to the default', () => {
    savePollingRule('tomorrow', { intervalMs: 30_000 });
    savePollingRule('tomorrow', { intervalMs: TOMORROW_INTERVAL_MS });
    expect(pacingFor('tomorrow').customized).toBe(false);
    expect(kvdb.get(POLLING_SETTINGS_KEY)).toBeUndefined();
  });

  it('keeps the override when the interval itself is still the default', () => {
    savePollingRule('nextll', { belowFloor: true });
    expect(loadPollingSettings()).toEqual({ nextll: { belowFloor: true } });
    expect(pacingFor('nextll').intervalMs).toBe(RAPID_INTERVAL_MS);
    expect(pacingFor('nextll').floorMs).toBe(ABSOLUTE_MIN_INTERVAL_MS);
  });

  it('fills cadence() from what was saved', () => {
    savePollingRule('idle', { intervalMs: 20_000 });
    savePollingRule('refill', { intervalMs: 4000 });
    expect(cadenceIntervals()).toMatchObject({
      nextllMs: RAPID_INTERVAL_MS,
      idleMs: 20_000,
      approachMs: APPROACH_INTERVAL_MS,
      burstMs: BURST_INTERVAL_MS,
      tomorrowMs: TOMORROW_INTERVAL_MS,
      refillMs: 4000,
    });
  });
});

describe('stored garbage', () => {
  it('ignores a store that is not a set of paces', () => {
    kvdb.set(POLLING_SETTINGS_KEY, ['nextll']);
    expect(loadPollingSettings()).toEqual({});
    expect(pacingFor('nextll').intervalMs).toBe(RAPID_INTERVAL_MS);
  });

  it('ignores an unknown pace and a pace that is not an object', () => {
    kvdb.set(POLLING_SETTINGS_KEY, {
      nextll: { intervalMs: 800 },
      madeUp: { intervalMs: 1 },
      idle: 45,
    });
    expect(loadPollingSettings()).toEqual({ nextll: { intervalMs: 800 } });
    expect(pacingFor('idle').intervalMs).toBe(IDLE_INTERVAL_MS);
  });

  it('clamps a hand-edited interval on the way out', () => {
    kvdb.set(POLLING_SETTINGS_KEY, { nextll: { intervalMs: 50 } });
    expect(resolvePolling('nextll').intervalMs).toBe(RAPID_MIN_INTERVAL_MS);
    kvdb.set(POLLING_SETTINGS_KEY, {
      nextll: { intervalMs: 50, belowFloor: true },
    });
    expect(resolvePolling('nextll').intervalMs).toBe(ABSOLUTE_MIN_INTERVAL_MS);
  });
});

describe('reset', () => {
  it('resets one pace and leaves the rest', () => {
    savePollingRule('nextll', { intervalMs: 900 });
    savePollingRule('burst', { intervalMs: 2000 });
    expect(resetPollingRule('nextll').intervalMs).toBe(RAPID_INTERVAL_MS);
    expect(pacingFor('burst').intervalMs).toBe(2000);
  });

  it('resets every pace', () => {
    savePollingRule('nextll', { intervalMs: 900 });
    savePollingRule('timeSearch', { intervalMs: 12_000 });
    resetAllPolling();
    expect(pacingFor('nextll').customized).toBe(false);
    expect(pacingFor('timeSearch').intervalMs).toBe(CYCLE_MS);
  });
});

describe('seconds text', () => {
  it('formats the built-in paces the way the panel shows them', () => {
    expect(formatSeconds(600)).toBe('0.6');
    expect(formatSeconds(1200)).toBe('1.2');
    expect(formatSeconds(45_000)).toBe('45');
  });

  it('parses a positive number of seconds', () => {
    expect(parseSeconds('0.6')).toBe(600);
    expect(parseSeconds(' 1.2 ')).toBe(1200);
    expect(parseSeconds('15')).toBe(15_000);
  });

  it('rejects empty, zero, and anything that is not a number of seconds', () => {
    expect(parseSeconds('')).toBeUndefined();
    expect(parseSeconds('0')).toBeUndefined();
    expect(parseSeconds('-1')).toBeUndefined();
    expect(parseSeconds('fast')).toBeUndefined();
    expect(parseSeconds('1e2')).toBeUndefined();
  });
});
