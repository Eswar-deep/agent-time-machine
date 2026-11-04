# Troubleshooting

[Setup](SETUP.md) · [Demo](DEMO.md) · [Validation](VALIDATION.md)

## App unavailable or old interface

Run `npm ci`, `npm run build`, then the backend through the project interpreter.
Port 8000 serves the built frontend; Vite development uses port 5173.
Check `/api/health`. Identify an existing listener before stopping or replacing
it. Rebuild after frontend changes and restart after backend/configuration changes.

## Live mode and account access

Set the server key, accessible model, and a positive `ATM_LIVE_MAX_CALLS`,
then restart. The default is zero, and a one-call allowance is not enough for a
full task. The per-run maximum is 12. Health configuration availability or a
successful model catalog does not prove generation access.

After updating a key, create a new run. An old saved failure remains historical.

- **401:** Verify the key/account access. Keep credentials out of logs and Git.
- **402 / billing not configured:** Check billing for the account/team owning the
  key. Creating another key alone may not change billing.
- **Timeout / blocked socket / Windows 10013:** Check outbound HTTPS, proxy,
  firewall, or execution-tool network restrictions. Run the trusted backend in
  an allowed environment. Candidate guest isolation stays enabled.

Provider details are bounded and credentials redacted. Retries are disabled;
inspect the recorded error before explicitly trying again.

## Provider returns no usable action

Output budgets include reasoning and visible output. HTTP success can still
contain a truncated completion. Start with the documented 2,048-token budget
and `low` reasoning; inspect the finish reason. Exactly one supported tool
call per tool turn is allowed. Progress text with one tool call is supported.
Invalid arguments/tools, multiple calls, and exhausted budgets are recorded.

## Checkpoint or runtime unavailable

Source, policy, schema, configuration, and runtime fingerprints are validated.
Create a fresh run after implementation changes; do not bypass hashes.
Old runs remain inspectable while unsupported restoration is rejected.

For missing WASM artifacts, use Node.js 22 and `npm ci`. The pinned runtime
and launcher are required. Execution fails closed; no native candidate fallback
exists. Actual stderr distinguishes infrastructure errors from behavior failures.

## Visible Exit 0 but final failure

The visible suite and protected evaluation are different layers. In **The
misleading green test**, the injected assertion expects the bug, making the
visible command pass. Test integrity and protected behavior still fail.
Inspect **Results → Code changes** and **Test results**.

## Successful branch contains an Exit 1 action

An action marked **Inherited** ran before the intervention. Its failure stays
in history. Inspect the fresh test after the edit and the final evaluation.
Passing 28/28 describes the resulting code, not every historical command.

## Manual parser edit returns undefined

`write_file` replaces a complete file. Keep the final return after modifying
the offset calculation:

```javascript
const offsetMinutes = zone === "Z" ? 0 :
  (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6))) *
  (zone[0] === "+" ? 1 : -1);
return new Date(local.getTime() - offsetMinutes * 60000).toISOString();
```

Omitting the return makes valid inputs produce `undefined`. Preserve that
failed attempt, fork before its edit, and submit the corrected source.
Accept it only after actual commands and protected checks pass.
