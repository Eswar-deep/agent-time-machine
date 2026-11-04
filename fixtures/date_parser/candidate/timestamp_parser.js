"use strict";

// Parse the timestamp formats supported by the release scheduler.
function parseTimestamp(value) {
  if (typeof value !== "string") throw new TypeError("Expected a timestamp string");
  const pattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?([+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  const match = pattern.exec(value);
  if (!match || match[0] !== value) throw new RangeError("Expected an explicit timezone");

  const [, y, mo, d, h, mi, s, fraction = "", zone] = match;
  const year = Number(y), month = Number(mo), day = Number(d);
  const hour = Number(h), minute = Number(mi), second = Number(s);
  const millisecond = Number(fraction.padEnd(3, "0"));
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, millisecond);
  if (
    local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day || local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute || local.getUTCSeconds() !== second
  ) throw new RangeError("Invalid calendar date or time");

  const offsetMinutes = (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6))) *
    (zone[0] === "+" ? 1 : -1);
  return new Date(local.getTime() - offsetMinutes * 60000).toISOString();
}

module.exports = { parseTimestamp };
