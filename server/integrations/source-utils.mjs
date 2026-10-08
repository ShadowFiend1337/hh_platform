import { setTimeout as delay } from 'node:timers/promises';
import { ProviderError } from './provider-http.mjs';

export const integer = value => Number.isSafeInteger(value) && value >= 0;
export const positive = value => integer(value) && value > 0;
export function sourceDate(value, now = Date.now) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/u.test(value) || !Number.isFinite(Date.parse(value)) || Date.parse(value) > now()) throw new ProviderError('invalid_source_response');
  return new Date(value).toISOString();
}
export function sourceText(value, max = 250) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/u.test(value)) throw new ProviderError('invalid_source_response');
  return value.trim();
}
export function evidence(id, title, occurredAt, result, sourceUrl, discipline, participation = 'individual', place = null) {
  return { id, title, occurredAt, result, sourceUrl, discipline, participation, place, teamRole: null, status: 'active' };
}
// Shared per adapter instance, bounded and sequential across candidate jobs.
export class SourceQueue {
  constructor(spacingMs = 1100) { this.spacingMs = spacingMs; this.queue = Promise.resolve(); this.nextAt = 0; this.pending = 0; }
  run(fn) {
    if (this.pending >= 20) throw new ProviderError('rate_limited', true, 3);
    this.pending++;
    const work = this.queue.then(async () => {
      const wait = this.nextAt - Date.now(); if (wait > 0) await delay(wait);
      this.nextAt = Date.now() + this.spacingMs;
      return fn();
    });
    this.queue = work.catch(() => {});
    return work.finally(() => { this.pending--; });
  }
}
