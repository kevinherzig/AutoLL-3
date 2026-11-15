import kvdb from '@/kvdb';
import { storageKey } from '@/storageNamespace';

import {
  APPROACH_INTERVAL_MS,
  BURST_INTERVAL_MS,
  type CadenceIntervals,
  type CadenceRule,
  IDLE_INTERVAL_MS,
  MIN_INTERVAL_MS,
  RAPID_INTERVAL_MS,
  RAPID_MIN_INTERVAL_MS,
  REFILL_INTERVAL_MS,
  TOMORROW_INTERVAL_MS,
} from './schedule';

export const POLLING_SETTINGS_KEY = storageKey('polling.settings');

/**
 * Lowest interval an explicit override may store.
 *
 * Under this the loop stops being a poll and starts being a spin: each check
 * still has to finish, and the shared rate limit still throws, but a stored
 * zero would schedule the next check immediately forever. 200ms is already
 * far inside the safety floor and is the bottom the panel will accept.
 */
export const ABSOLUTE_MIN_INTERVAL_MS = 200;

/** Slowest interval the panel will store: ten minutes. */
export const MAX_INTERVAL_MS = 10 * 60_000;

export const DEFAULT_JITTER_PERCENT = 20;
export const MAX_JITTER_PERCENT = 50;

/**
 * Every pace the control panel can set, in the order the screen shows them.
 *
 * `timeSearch` is not a cadence rule: Time Search sleeps on its own clock.
 * The rest are the rules `cadence()` returns.
 */
export const POLLING_RULES = [
  'nextll',
  'timeSearch',
  'idle',
  'approach',
  'burst',
  'tomorrow',
  'refill',
] as const;

export type PollingRule = (typeof POLLING_RULES)[number];

export interface PollingSpec {
  rule: PollingRule;
  title: string;
  /** What this pace is for, in a sentence or two. */
  detail: string;
  defaultMs: number;
  /**
   * Ordinary minimum. An interval under this is stored only when `belowFloor`
   * is on, and jitter is raised to this unless that override is on.
   */
  floorMs: number;
  absoluteMinMs: number;
  maxMs: number;
  defaultJitterPercent: number;
  maxJitterPercent: number;
}

export const POLLING_SPECS: readonly PollingSpec[] = [
  {
    rule: 'nextll',
    title: 'NextLL search',
    detail:
      'The book search on the NextLL tab. It keeps its own watch list and asks the tipboard about one attraction. The built-in pace is 0.6 seconds.',
    defaultMs: RAPID_INTERVAL_MS,
    floorMs: RAPID_MIN_INTERVAL_MS,
    absoluteMinMs: ABSOLUTE_MIN_INTERVAL_MS,
    maxMs: MAX_INTERVAL_MS,
    defaultJitterPercent: DEFAULT_JITTER_PERCENT,
    maxJitterPercent: MAX_JITTER_PERCENT,
  },
  {
    rule: 'timeSearch',
    title: 'Time Search',
    detail:
      'Time Search and Change attraction. One check can be several requests, so the built-in pace is 6 seconds with no jitter.',
    defaultMs: 6000,
    floorMs: MIN_INTERVAL_MS,
    absoluteMinMs: ABSOLUTE_MIN_INTERVAL_MS,
    maxMs: MAX_INTERVAL_MS,
    defaultJitterPercent: 0,
    maxJitterPercent: MAX_JITTER_PERCENT,
  },
  {
    rule: 'idle',
    title: 'Autopilot idle',
    detail:
      'Autopilot when nothing is coming up. The built-in pace is 45 seconds.',
    defaultMs: IDLE_INTERVAL_MS,
    floorMs: MIN_INTERVAL_MS,
    absoluteMinMs: ABSOLUTE_MIN_INTERVAL_MS,
    maxMs: MAX_INTERVAL_MS,
    defaultJitterPercent: DEFAULT_JITTER_PERCENT,
    maxJitterPercent: MAX_JITTER_PERCENT,
  },
  {
    rule: 'approach',
    title: 'Autopilot approach',
    detail:
      'Autopilot from five minutes out until two minutes before a drop or a booking time. The built-in pace is 6 seconds.',
    defaultMs: APPROACH_INTERVAL_MS,
    floorMs: MIN_INTERVAL_MS,
    absoluteMinMs: ABSOLUTE_MIN_INTERVAL_MS,
    maxMs: MAX_INTERVAL_MS,
    defaultJitterPercent: DEFAULT_JITTER_PERCENT,
    maxJitterPercent: MAX_JITTER_PERCENT,
  },
  {
    rule: 'burst',
    title: 'Autopilot burst',
    detail:
      'Autopilot from two minutes before a target until two minutes after. The built-in pace is 1.2 seconds.',
    defaultMs: BURST_INTERVAL_MS,
    floorMs: MIN_INTERVAL_MS,
    absoluteMinMs: ABSOLUTE_MIN_INTERVAL_MS,
    maxMs: MAX_INTERVAL_MS,
    defaultJitterPercent: DEFAULT_JITTER_PERCENT,
    maxJitterPercent: MAX_JITTER_PERCENT,
  },
  {
    rule: 'tomorrow',
    title: 'Tomorrow watch',
    detail:
      'Autopilot watching tomorrow, between 7:00 and 22:00 park time. The built-in pace is 15 seconds.',
    defaultMs: TOMORROW_INTERVAL_MS,
    floorMs: MIN_INTERVAL_MS,
    absoluteMinMs: ABSOLUTE_MIN_INTERVAL_MS,
    maxMs: MAX_INTERVAL_MS,
    defaultJitterPercent: DEFAULT_JITTER_PERCENT,
    maxJitterPercent: MAX_JITTER_PERCENT,
  },
  {
    rule: 'refill',
    title: 'Refill window',
    detail:
      'Autopilot while a watched attraction is inside a refill window and no drop is closer. The built-in pace is 6 seconds, the same as approach, and this can be set on its own.',
    defaultMs: REFILL_INTERVAL_MS,
    floorMs: MIN_INTERVAL_MS,
    absoluteMinMs: ABSOLUTE_MIN_INTERVAL_MS,
    maxMs: MAX_INTERVAL_MS,
    defaultJitterPercent: DEFAULT_JITTER_PERCENT,
    maxJitterPercent: MAX_JITTER_PERCENT,
  },
];

/** What was saved for one pace. Absent fields mean the built-in default. */
export interface PollingOverride {
  intervalMs?: number;
  /** Half-width of the random spread, in percent. 20 means ±20%. */
  jitterPercent?: number;
  /**
   * Let the interval and the jitter floor drop from `floorMs` to
   * `absoluteMinMs`. Off unless the person turned the warning on.
   */
  belowFloor?: boolean;
}

export type PollingSettings = Partial<Record<PollingRule, PollingOverride>>;

export interface ResolvedPolling {
  rule: PollingRule;
  intervalMs: number;
  jitterPercent: number;
  /** Passed to `withJitter`. 0.2 means ±20%. */
  jitterFraction: number;
  /**
   * Applied after jitter. The ordinary floor, or the absolute minimum when
   * the override is on.
   */
  floorMs: number;
  belowFloor: boolean;
  /** True when any saved field differs from the built-in default. */
  customized: boolean;
}

const SPEC_BY_RULE = new Map(POLLING_SPECS.map(spec => [spec.rule, spec]));

export function specFor(rule: PollingRule): PollingSpec {
  const spec = SPEC_BY_RULE.get(rule);
  if (!spec) throw new Error(`Unknown polling rule: ${rule}`);
  return spec;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function isOverride(value: unknown): value is PollingOverride {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Saved paces, ignoring anything that is not one of the known rules. */
export function loadPollingSettings(): PollingSettings {
  const stored = kvdb.get<unknown>(POLLING_SETTINGS_KEY);
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return {};
  }
  const out: PollingSettings = {};
  const record = stored as Record<string, unknown>;
  for (const rule of POLLING_RULES) {
    const value = record[rule];
    if (isOverride(value)) out[rule] = value;
  }
  return out;
}

/**
 * The pace a poller should use.
 *
 * Clamped here, on the way out, so a hand-edited store cannot schedule a
 * wait under the floor. The rate limit and the 403/429 pushback are separate
 * and are not changed by anything in this file.
 */
export function resolvePolling(
  rule: PollingRule,
  settings: PollingSettings = loadPollingSettings()
): ResolvedPolling {
  const spec = specFor(rule);
  const stored = settings[rule];
  const belowFloor = stored?.belowFloor === true;
  const min = belowFloor ? spec.absoluteMinMs : spec.floorMs;
  const rawInterval = finite(stored?.intervalMs);
  const intervalMs =
    rawInterval === undefined
      ? spec.defaultMs
      : Math.round(Math.min(spec.maxMs, Math.max(min, rawInterval)));
  const rawJitter = finite(stored?.jitterPercent);
  const jitterPercent =
    rawJitter === undefined
      ? spec.defaultJitterPercent
      : Math.round(Math.min(spec.maxJitterPercent, Math.max(0, rawJitter)));
  return {
    rule,
    intervalMs,
    jitterPercent,
    jitterFraction: jitterPercent / 100,
    floorMs: min,
    belowFloor,
    customized:
      intervalMs !== spec.defaultMs ||
      jitterPercent !== spec.defaultJitterPercent ||
      belowFloor,
  };
}

/** The pace as stored right now. Read at tick time, so a change is live. */
export function pacingFor(rule: PollingRule): ResolvedPolling {
  return resolvePolling(rule);
}

/** Intervals for `cadence()`, already clamped. */
export function cadenceIntervals(
  settings: PollingSettings = loadPollingSettings()
): CadenceIntervals {
  const at = (rule: CadenceRule) => resolvePolling(rule, settings).intervalMs;
  return {
    nextllMs: at('nextll'),
    idleMs: at('idle'),
    approachMs: at('approach'),
    burstMs: at('burst'),
    tomorrowMs: at('tomorrow'),
    refillMs: at('refill'),
  };
}

function compact(settings: PollingSettings): PollingSettings {
  const out: PollingSettings = {};
  for (const rule of POLLING_RULES) {
    const spec = specFor(rule);
    const resolved = resolvePolling(rule, settings);
    if (!resolved.customized) continue;
    out[rule] = {
      ...(resolved.intervalMs !== spec.defaultMs
        ? { intervalMs: resolved.intervalMs }
        : {}),
      ...(resolved.jitterPercent !== spec.defaultJitterPercent
        ? { jitterPercent: resolved.jitterPercent }
        : {}),
      ...(resolved.belowFloor ? { belowFloor: true } : {}),
    };
  }
  return out;
}

function write(settings: PollingSettings): void {
  const stored = compact(settings);
  if (Object.keys(stored).length === 0) kvdb.delete(POLLING_SETTINGS_KEY);
  else kvdb.set(POLLING_SETTINGS_KEY, stored);
}

/** Merge a change for one pace and store the clamped result. */
export function savePollingRule(
  rule: PollingRule,
  patch: PollingOverride
): ResolvedPolling {
  const settings = loadPollingSettings();
  settings[rule] = { ...settings[rule], ...patch };
  write(settings);
  return resolvePolling(rule);
}

export function resetPollingRule(rule: PollingRule): ResolvedPolling {
  const settings = loadPollingSettings();
  delete settings[rule];
  write(settings);
  return resolvePolling(rule);
}

export function resetAllPolling(): void {
  kvdb.delete(POLLING_SETTINGS_KEY);
}

/** "0.6", "1.2", "45". */
export function formatSeconds(ms: number): string {
  return String(Math.round(ms) / 1000);
}

/** Seconds as typed in the panel, or nothing if it is not a positive number. */
export function parseSeconds(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.round(seconds * 1000);
}
