import {
  pacingFor,
  resetAllPolling,
  savePollingRule,
} from '@/autopilot/pollingSettings';
import { RAPID_INTERVAL_MS, RAPID_MIN_INTERVAL_MS } from '@/autopilot/schedule';
import { fireEvent, render, screen } from '@/testing';

import Polling from './Polling';

beforeEach(() => resetAllPolling());
afterEach(() => resetAllPolling());

function interval() {
  return screen.getByRole('spinbutton', { name: 'NextLL search interval' });
}

function setIntervalSeconds(seconds: string) {
  fireEvent.change(interval(), { target: { value: seconds } });
  fireEvent.blur(interval());
}

describe('Polling', () => {
  it('shows the NextLL default and warns that faster polling can block the account', () => {
    render(<Polling />);
    expect(
      screen.getByRole('heading', { name: 'Polling' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Faster polling raises the chance Disney blocks the account/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the first 403 still stops every search/)
    ).toBeInTheDocument();
    expect(interval()).toHaveValue(RAPID_INTERVAL_MS / 1000);
    expect(
      screen.getByRole('spinbutton', { name: 'NextLL search jitter' })
    ).toHaveValue(20);
    expect(screen.getByText(/Default 0\.6 s/)).toBeInTheDocument();
  });

  it('saves a NextLL interval for the poller to read', () => {
    render(<Polling />);
    setIntervalSeconds('1.5');
    expect(pacingFor('nextll').intervalMs).toBe(1500);
    expect(pacingFor('nextll').jitterPercent).toBe(20);
    expect(interval()).toHaveValue(1.5);
  });

  it('raises a too-fast interval to the floor until faster polling is allowed', () => {
    render(<Polling />);
    setIntervalSeconds('0.2');
    expect(pacingFor('nextll').intervalMs).toBe(RAPID_MIN_INTERVAL_MS);
    expect(pacingFor('nextll').belowFloor).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent(/0\.5 s/);
    expect(interval()).toHaveValue(0.5);
  });

  it('allows the absolute minimum only with the warning, and not below it', () => {
    render(<Polling />);
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Allow NextLL search faster than 0.5 s',
      })
    );
    expect(
      screen.getByText(/Faster than the 0.5 s safety floor/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/5-request limit is unchanged/)
    ).toBeInTheDocument();
    setIntervalSeconds('0.3');
    expect(pacingFor('nextll').intervalMs).toBe(300);
    setIntervalSeconds('0.05');
    expect(pacingFor('nextll').intervalMs).toBe(200);
    expect(screen.getByRole('status')).toHaveTextContent(/0\.2 s/);
  });

  it('resets NextLL, and can reset every pace', () => {
    render(<Polling />);
    setIntervalSeconds('2');
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset NextLL search' })
    );
    expect(pacingFor('nextll').intervalMs).toBe(RAPID_INTERVAL_MS);
    expect(
      screen.queryByRole('button', { name: 'Reset NextLL search' })
    ).not.toBeInTheDocument();

    setIntervalSeconds('2');
    savePollingRule('idle', { intervalMs: 20_000 });
    fireEvent.click(screen.getByRole('button', { name: 'Reset every pace' }));
    expect(pacingFor('nextll').customized).toBe(false);
    expect(pacingFor('idle').customized).toBe(false);
  });

  it('offers the other searches as their own sections', () => {
    render(<Polling />);
    for (const title of [
      'Time Search',
      'Autopilot idle',
      'Autopilot approach',
      'Autopilot burst',
      'Tomorrow watch',
      'Refill window',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('saves a Time Search interval from its own section', () => {
    render(<Polling />);
    fireEvent.click(screen.getByText('Time Search'));
    const field = screen.getByRole('spinbutton', {
      name: 'Time Search interval',
    });
    expect(field).toHaveValue(6);
    fireEvent.change(field, { target: { value: '12' } });
    fireEvent.blur(field);
    expect(pacingFor('timeSearch').intervalMs).toBe(12_000);
    expect(pacingFor('nextll').intervalMs).toBe(RAPID_INTERVAL_MS);
  });
});
