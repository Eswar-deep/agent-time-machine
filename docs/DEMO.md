# A short, reproducible demonstration

Start with a built interface and the backend running at http://127.0.0.1:8000.
No key is required. All task and customer data is synthetic.

## 1. A decision worth rewinding

Run **The wrong order** in **Deterministic demo** mode.

Say: “This agent has the correct request and consent. We deliberately injected
a wrong order ID to demonstrate the debugger. These are actual simulator calls,
not a live model result.”

Inspect the request: cancel `#W1048201`, keep `#W1048202`.
Select the final `cancel_pending_order` checkpoint. Its pending arguments
incorrectly target `#W1048202`.

## 2. An isolated alternative

Change only `order_id` to `#W1048201`, then **Fork & execute**.
The new branch cancels the requested order and leaves the gift untouched.
Its fresh final response reports the real refund and timing.

Show parent and branch checks, actual changed state paths, and the parent hash.
The displayed result is **passed implemented checks**, not complete policy
compliance. The original future was not fed to the continuing agent.

## 3. An intervention that fails

Open **Parent run**. Change the same pending order ID to `#MISSING`.
Execute another fork. Show the actual tool error, failed execution/checks, and
unchanged parent. The successful sibling remains available in history.

## 4. Replay and presentation reliability

Open a saved original and choose **Replay unchanged**. All tool calls, including
reads, execute again. Observation/state matches are reported separately from task
success. Assistant messages here are recorded playback.

Saved original, successful branch, and failed branch can all be reopened from
history. Restart the server to demonstrate SQLite persistence.

## 5. Incompatible state is rejected

Export a checkpoint from the inspector. Generate a separate demonstration copy:

```powershell
.\.venv\Scripts\python.exe scripts/make_incompatible_checkpoint.py checkpoint.json incompatible.json
```

Open **How it works**, choose **Validate checkpoint file**, and import that
copy. The UI displays the unsupported-format reason. The original export is
unchanged. A checksum is an integrity check, not an adversarial security claim.

## Optional live segment

Only after configuring account access, model, and a bounded allowance:

1. Record a **Live Meta** run, or choose a saved checkpoint.
2. Ask Meta for a structured patch. The separate proposer may inspect the full
   failed trace; its access is explicitly labeled.
3. Review the proposed tool and arguments, then fork with a fresh Meta
   continuation. The continuing agent sees only checkpoint context and the
   executed change.
4. Show all outcomes, usage, latency, failures, and unknown costs honestly.

No live successful repair is currently available. Do not describe deterministic
or mocked tests as live Meta evidence. No frozen live evaluation or comparative
recovery advantage has been established.

