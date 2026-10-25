import test from 'node:test';
import assert from 'node:assert/strict';
import { guessTimeZone, localTime, hourOffsetFrom, isValidTimeZone } from '../extension/core/geo.js';

test('cities, regions, countries and codes resolve to IANA zones', () => {
  const cases = {
    'San Francisco, CA, US': 'America/Los_Angeles', 'San Francisco Bay Area': 'America/Los_Angeles', 'Greater New York City Area': 'America/New_York',
    'Austin, Texas, United States': 'America/Chicago', 'Denver, CO': 'America/Denver', 'Phoenix, Arizona': 'America/Phoenix',
    'Berlin, Germany': 'Europe/Berlin', 'Hamburg, DE': 'Europe/Berlin', 'Zürich, Schweiz': 'Europe/Zurich', 'London, England, United Kingdom': 'Europe/London', 'Paris': 'Europe/Paris',
    'Shenzhen, Guangdong, China': 'Asia/Shanghai', 'Bengaluru, Karnataka, India': 'Asia/Kolkata', 'Tel Aviv, Israel': 'Asia/Jerusalem', 'Singapore': 'Asia/Singapore',
    'Toronto, Ontario, Canada': 'America/Toronto', 'Vancouver, BC, Canada': 'America/Vancouver', 'Sydney, New South Wales, Australia': 'Australia/Sydney', 'Perth, Australia': 'Australia/Perth',
    'Smalltown, Indiana, United States': 'America/Indiana/Indianapolis', 'Smalltown, IN, US': 'America/Indiana/Indianapolis', 'Smalltown, IN': 'Asia/Kolkata',
  };
  for (const [loc, tz] of Object.entries(cases)) assert.equal(guessTimeZone(loc), tz, loc);
  for (const tz of Object.values(cases)) assert.ok(isValidTimeZone(tz), tz);
});

test('unknown or empty locations give null, never a throw', () => {
  for (const v of ['Nowhere Special', '', null, undefined, 42, 'Remote', 'Earth']) assert.equal(guessTimeZone(v), null, String(v));
});

test('localTime and hourOffsetFrom', () => {
  const now = new Date('2026-07-01T10:00:00Z'); // mid-summer: no DST boundary
  assert.equal(localTime('Asia/Shanghai', now, 'en-GB'), '18:00');
  assert.equal(localTime('Mars/Olympus', now), null);
  assert.equal(hourOffsetFrom('Asia/Shanghai', 'Europe/Berlin', now), 6);
  assert.equal(hourOffsetFrom('America/Los_Angeles', 'Europe/Berlin', now), -9);
  assert.equal(hourOffsetFrom('Asia/Kolkata', 'UTC', now), 5.5);
});
