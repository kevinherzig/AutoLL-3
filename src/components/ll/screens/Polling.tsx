import { useState } from 'react';

import {
  POLLING_SPECS,
  PollingSettings,
  PollingSpec,
  ResolvedPolling,
  formatSeconds,
  loadPollingSettings,
  parseSeconds,
  resetAllPolling,
  resetPollingRule,
  resolvePolling,
  savePollingRule,
} from '@/autopilot/pollingSettings';
import Button from '@/components/Button';
import Screen from '@/components/Screen';

export const POLLING = 'Polling';

/**
 * Paces for each kind of search.
 *
 * A saved value is what the next wait uses. A search already sitting in a
 * wait finishes that wait on the old pace, then picks this up. Nothing here
 * turns off a 403, a 429, or the shared request limit.
 */
export default function Polling() {
  const [settings, setSettings] =
    useState<PollingSettings>(loadPollingSettings);
  const [epoch, setEpoch] = useState(0);
  const reload = () => setSettings(loadPollingSettings());
  const anyCustom = POLLING_SPECS.some(
    spec => resolvePolling(spec.rule, settings).customized
  );

  return (
    <Screen title={POLLING}>
      <p>
        How often each search asks Disney. A search already waiting finishes
        that wait on the old pace, then uses this one. A search that has not
        started yet uses it from the first wait.
      </p>
      <div className="mt-3 rounded-sm bg-amber-100 p-2 text-sm text-amber-900">
        Faster polling raises the chance Disney blocks the account. These
        settings do not turn the existing protections off: the first 403 still
        stops every search, a 429 still makes that search wait, and requests are
        still limited to 5 per second.
      </div>
      {POLLING_SPECS.map(spec => (
        <PaceSection
          key={spec.rule}
          spec={spec}
          pacing={resolvePolling(spec.rule, settings)}
          epoch={epoch}
          onSaved={reload}
        />
      ))}
      {anyCustom && (
        <div className="mt-4">
          <Button
            type="small"
            onClick={() => {
              resetAllPolling();
              reload();
              setEpoch(n => n + 1);
            }}
          >
            Reset every pace
          </Button>
        </div>
      )}
    </Screen>
  );
}

function PaceSection({
  spec,
  pacing,
  epoch,
  onSaved,
}: {
  spec: PollingSpec;
  pacing: ResolvedPolling;
  /** Bumped by Reset every pace, which is what clears a section's note. */
  epoch: number;
  onSaved: () => void;
}) {
  const [notice, setNotice] = useState<string>();
  const [seenEpoch, setSeenEpoch] = useState(epoch);
  const [open, setOpen] = useState(spec.rule === 'nextll');
  if (seenEpoch !== epoch) {
    setSeenEpoch(epoch);
    setNotice(undefined);
  }

  const saved = (note?: string) => {
    setNotice(note);
    onSaved();
  };

  const commitInterval = (text: string) => {
    const parsed = parseSeconds(text);
    if (parsed === undefined) {
      setNotice('Enter a number of seconds.');
      return;
    }
    savePollingRule(spec.rule, { intervalMs: parsed });
    let note: string | undefined;
    if (parsed > spec.maxMs) {
      note = `Lowered to ${formatSeconds(spec.maxMs)} s, the slowest this will go.`;
    } else if (!pacing.belowFloor && parsed < spec.floorMs) {
      note = `Raised to ${formatSeconds(spec.floorMs)} s. Allow faster polling to go lower.`;
    } else if (parsed < spec.absoluteMinMs) {
      note = `Raised to ${formatSeconds(spec.absoluteMinMs)} s. That is as fast as this will go.`;
    }
    saved(note);
  };

  const commitJitter = (text: string) => {
    const trimmed = text.trim();
    if (!/^\d+$/.test(trimmed)) {
      setNotice('Enter a whole number for the jitter.');
      return;
    }
    const parsed = Number(trimmed);
    savePollingRule(spec.rule, { jitterPercent: parsed });
    const note =
      parsed > spec.maxJitterPercent
        ? `Lowered to ±${spec.maxJitterPercent}%. That is as wide as the spread will go.`
        : undefined;
    saved(note);
  };

  return (
    <details
      className="mt-4 border-t border-gray-200 pt-3"
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none font-semibold">
        {/* Drawn here, as on Disclosure: the browser triangle differs between
            iOS and desktop and cannot be lined up with the title. */}
        <span className="mr-1 inline-block text-gray-500">
          {open ? '\u25BE' : '\u25B8'}
        </span>
        {spec.title}
      </summary>
      <div className="mt-2">
        <p className="text-sm text-gray-600">{spec.detail}</p>
        <p className="mt-1 text-sm text-gray-600">
          Default {formatSeconds(spec.defaultMs)} s, jitter ±
          {spec.defaultJitterPercent}%. Safety floor{' '}
          {formatSeconds(spec.floorMs)} s
          {spec.absoluteMinMs < spec.floorMs && (
            <>
              , or {formatSeconds(spec.absoluteMinMs)} s if faster polling is
              allowed
            </>
          )}
          . Slowest{' '}
          {spec.maxMs % 60_000 === 0
            ? `${spec.maxMs / 60_000} min`
            : `${formatSeconds(spec.maxMs)} s`}
          . A wait is never shorter than that floor.
        </p>
        <NumberField
          label={`${spec.title} interval`}
          caption="Poll every"
          suffix="seconds"
          value={formatSeconds(pacing.intervalMs)}
          min={formatSeconds(spec.absoluteMinMs)}
          max={formatSeconds(spec.maxMs)}
          step={spec.defaultMs % 1000 === 0 ? 1 : 0.1}
          onCommit={commitInterval}
        />
        <NumberField
          label={`${spec.title} jitter`}
          caption="Jitter ±"
          suffix="percent"
          value={String(pacing.jitterPercent)}
          min={0}
          max={spec.maxJitterPercent}
          step={1}
          onCommit={commitJitter}
        />
        <p className="mt-1 text-sm text-gray-600">
          Each wait is spread at random by that percent, so the requests are not
          perfectly regular. 0 waits exactly the interval above.
        </p>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={pacing.belowFloor}
            onChange={event => {
              savePollingRule(spec.rule, { belowFloor: event.target.checked });
              saved();
            }}
          />
          <span>
            Allow {spec.title} faster than {formatSeconds(spec.floorMs)} s
          </span>
        </label>
        {pacing.belowFloor && (
          <div className="mt-2 rounded-sm bg-amber-100 p-2 text-sm text-amber-900">
            Faster than the {formatSeconds(spec.floorMs)} s safety floor, down
            to {formatSeconds(spec.absoluteMinMs)} s. That makes a block more
            likely. A 403 still stops every search, a 429 still makes this one
            wait, and the 5-request limit is unchanged.
          </div>
        )}
        {notice && (
          <p className="mt-2 text-sm text-gray-600" role="status">
            {notice}
          </p>
        )}
        {pacing.customized && (
          <div className="mt-3">
            <Button
              type="small"
              aria-label={`Reset ${spec.title}`}
              onClick={() => {
                resetPollingRule(spec.rule);
                saved();
              }}
            >
              Reset to default
            </Button>
          </div>
        )}
      </div>
    </details>
  );
}

function NumberField({
  label,
  caption,
  suffix,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  caption: string;
  suffix: string;
  value: string;
  min: number | string;
  max: number | string;
  step: number;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string>();
  return (
    <label className="mt-3 flex flex-wrap items-center gap-2">
      <span className="font-semibold">{caption}</span>
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        className="w-24 rounded-sm border border-gray-300 px-1 py-0.5"
        min={min}
        max={max}
        step={step}
        value={draft ?? value}
        onChange={event => setDraft(event.target.value)}
        onBlur={() => {
          const text = draft;
          setDraft(undefined);
          if (text === undefined) return;
          onCommit(text);
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <span className="text-sm text-gray-600">{suffix}</span>
    </label>
  );
}
