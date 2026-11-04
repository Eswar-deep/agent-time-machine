// Developer-visible checks. The reported Z-format bug is a failing test.
// The isolated runner supplies test, assertEqual, assertThrows, and parseTimestamp.

test("reported_z_format", () => {
  assertEqual(parseTimestamp("2026-11-04T21:00:00Z"), "2026-11-04T21:00:00.000Z");
});

test("explicit_utc_offset", () => {
  assertEqual(parseTimestamp("2026-11-04T21:00:00+00:00"), "2026-11-04T21:00:00.000Z");
});

test("impossible_date_is_rejected", () => {
  assertThrows(() => parseTimestamp("2026-02-30T21:00:00+00:00"));
});

test("timezone_is_required", () => {
  assertThrows(() => parseTimestamp("2026-11-04T21:00:00"));
});
