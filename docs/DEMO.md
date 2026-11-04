# Project walkthrough

[Project overview](../README.md) · [Setup](SETUP.md) · [Recorded demo](VIDEO_SCRIPT.md)

## Inspect the injected regression

Open **Debugger**, choose **A fix that shifts time**, and run **Deterministic demo**.
In **Results**, open **Code changes** and **Test results**. The scripted edit accepts
a timestamp ending in `Z`, but removes the adjustment needed for other timezone offsets.
The visible suite exits successfully. The final evaluation reports **25/28**.

## Test an alternative edit

Select the `write_file` event and open **Intervene**. In **Source content**, replace
`return new Date(local.getTime()).toISOString();` with:

```javascript
return new Date(local.getTime() - offsetMinutes * 60000).toISOString();
```

Keep **Deterministic demo policy**, then click **Fork & execute**. Compare the patch,
command output, and checks with the original. The supplied correction passes **28/28**
on the bundled fixture. A failed command inherited from before the edit remains in the
timeline as part of the original execution.

## Run a Meta proposal

With [live Meta configured](SETUP.md#meta-configuration), open the original run and choose
**Analyze with Meta**. Review the cited events, selected checkpoint, and exact proposed
action. **Fork & execute proposal** applies the reviewed action in a separate branch and
continues with fresh model calls. Review the branch's final checks to see whether it passed.

**Restart without advice** starts fresh from the selected checkpoint without the proposed
action. Use it to compare the cost and outcome of repair advice at the same boundary.
The [recorded experiment](VALIDATION.md#meta-repair-and-restart) includes proposal overhead.

## Compare an entire demo run with live Meta

Open **Playground** and choose **Compare demo and Meta**. The local scripted run and live
agent start from the same parser files and use the same protected tests. Compare the
results and usage, or open either run in the debugger.

The scripted run is an injected failure example. Use it to illustrate the regression
and verification workflow.

## Test a misleading pass

Choose **The misleading green test** in the debugger. The scripted edit weakens a
visible assertion, so the visible command exits successfully. Open **Test results**
to see the test-integrity failure and the original behavior checks that still fail.
