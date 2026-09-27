// iCalendar (RFC 5545) for a convened meeting. Shared on purpose: the site
// imports this file for its "Add to calendar" download and the mailer attaches
// the same output to invitations, so the two can never describe a meeting
// differently. No dependencies, no Node or DOM APIs.

export interface IcsMeeting {
  id: string;
  title: string;
  agenda: string;
  location: string;
  starts_at: string;
  duration_min: number;
  status: 'scheduled' | 'cancelled';
  updated_at: string;
}

const SITE = 'https://makerspace.network';

/** 2026-09-27T16:00:00.000Z → 20260927T160000Z */
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** Fold at 75 octets as the RFC requires, never splitting a character. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function meetingIcs(m: IcsMeeting): string {
  const end = new Date(Date.parse(m.starts_at) + m.duration_min * 60_000).toISOString();
  const url = `${SITE}/?page=people&meeting=${encodeURIComponent(m.id)}`;
  const cancelled = m.status === 'cancelled';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Makerspace Network//Meetings//EN',
    'CALSCALE:GREGORIAN',
    // PUBLISH, not REQUEST: answers are given on the site, so calendars should
    // not offer an accept button that emails nobody useful.
    `METHOD:${cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${m.id}@makerspace.network`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(m.starts_at)}`,
    `DTEND:${stamp(end)}`,
    // Every edit bumps updated_at, so its seconds are a sequence that only rises.
    `SEQUENCE:${Math.floor(Date.parse(m.updated_at) / 1000)}`,
    `SUMMARY:${esc(m.title)}`,
    `DESCRIPTION:${esc(`${m.agenda}${m.agenda ? '\n\n' : ''}Answer and see who is coming: ${url}`)}`,
    ...(m.location ? [`LOCATION:${esc(m.location)}`] : []),
    `URL:${url}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
