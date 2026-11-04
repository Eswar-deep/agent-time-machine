# Hackathon submission checklist

Updated November 3, 2026, Chicago time. This checklist includes organizer
announcements pasted by the participant, alongside the previously checked public
rules. It separates organizer requirements from project preparation steps and
does not mean that a submission has been sent or accepted.

## Verified organizer information

- **Deadline:** November 4, 2026, **9:00 PM Eastern / 8:00 PM Chicago (CST)**,
  or November 5 at 02:00 UTC. The organizer can change dates; recheck the
  [event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon).
- **Destination:** Submit through the
  [Cerebral Valley project portal](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit).
- **Meta usage:** The rules describe projects built with Meta AI products.
- **Track and team:** Enter one track. Indie teams can have up to four members;
  the representative submits and identifies the other members.
- **Judging:** Impact 30%; use of Meta AI tooling 25%; technical depth and
  execution 20%; demo 25%. Demo judging includes a working live product and
  video quality.
- **Source provenance:** Open-source components are permitted with their
  applicable licenses followed and an enhancement built on the underlying work.
- **Video:** Prepare a **3-minute demo video**. The organizer announcement supplied
  by the participant says: "Spend time on your 3-minute demo video."
- **Open source:** The supplied announcement says: "Ensure your github is open
  source. This technical detail is mandatory for all projects." The repository
  must be publicly accessible with an open-source license; a private GitHub URL
  does not complete this requirement.

The deadline and destination are from the event page. Meta usage, track/team,
judging and source provenance are from the
[Official Rules and Event Waiver](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver).
The video and open-source requirements are from organizer announcements supplied
by the participant on November 3. No further portal browsing is needed to
establish those two requirements.

## Submission details not yet inspected

The final project form has not been inspected in an authenticated session.
Registration/application questions are not evidence of the final submission
fields. These details remain unverified; this checklist does not request another
login or further browsing:

- [ ] Project name, description, track/theme, team and representative fields.
- [ ] Demo link or video upload mechanism and permitted host/format. The supplied
      announcement already establishes the 3-minute duration.
- [ ] Repository URL field and any additional judge access instructions. The
      supplied announcement already establishes the open-source requirement.
- [ ] Whether a deployed interactive app is required, or local setup plus
      recorded evidence is acceptable.
- [ ] Meta product/model and partner-integration questions, including length
      limits and required disclosures.
- [ ] Any new rules acknowledgments and final submission confirmation.

Whether a hosted interactive deployment is mandatory and whether any named judge
account needs access remain unknown. Do not invent additional requirements from
common hackathon conventions or other entrants' repositories.

## Agent Time Machine evidence package

These are project preparation steps for the scope agreed on November 3. They are
not additional organizer rules. Use actual saved evidence to fill in the summary;
do not replace missing live results with deterministic examples.

- [x] Show an original failed coding run, its task, patch and regression output.
      Label a deliberately injected mistake as injected.
- [x] Show an actual Meta repair-proposal request and structured response,
      including selected checkpoint, cited execution evidence, explanation,
      exact action/patch and expected observable improvement.
- [x] Show that the proposer receives development evidence and candidate files,
      while protected expected answers remain outside its prompt.
- [x] Execute the reviewed proposal in an isolated branch. Record fresh model
      continuation separately from inherited history or recorded playback.
- [x] Save original and alternative diffs, visible command output, protected
      results, failed branches, elapsed time and available measured usage.
- [x] Record model ID, actual inference provider, API surface, reasoning setting,
      inference budget and model role for every live part of the demonstration.
- [x] Retain unsuccessful proposals and correction overhead. Report unknown
      monetary cost as unknown.
- [x] Include the injected misleading-green negative case: visible command
      Exit 0, independent rejection and the altered assertion.
- [x] If comparing with a restart without advice, declare the information access
      and call budget for both. Describe observed results without generalizing
      from one curated fixture.
- [x] Redact credentials from exported requests and errors; scan published evidence.
      Video credential review is part of the recording check below.

The [validation guide](VALIDATION.md) records observed checks and limitations.
The [demo guide](DEMO.md) explains the interface and test-result distinctions.
The [actual evidence package](../evidence/meta-repair-2026-11-03/README.md) and
[submission summary](SUBMISSION_SUMMARY.md) contain the completed experiment.

## Reviewer access and final checks

The repository is at
[Eswar-deep/agent-time-machine](https://github.com/Eswar-deep/agent-time-machine).
Before submitting, verify that the final revision is publicly accessible and
licensed for open-source use. Adding the [MIT license](../LICENSE) prepares the
source license; changing the remote repository from private to public is a
separate publication action.

The development app at `http://127.0.0.1:8000` is local to the developer's machine.
It is not a remotely accessible demo link. Choose an access method that satisfies
the actual form, test every submitted link from a separate browser session, and
keep model credentials server-side. Do not place API keys in repository access
instructions or recorded exports.

- [x] Test setup instructions from a clean source archive and ensure the demo
      does not depend on an ignored local SQLite record being in a fresh clone.
- [x] Include the redacted evidence needed for the demonstration in the repository.
- [x] Add an open-source license for original project code, retaining third-party
      licenses and notices.
- [ ] Make the GitHub repository public and verify access to its final revision.
- [x] Record the 3-minute walkthrough of problem, Meta proposal, branch execution,
      verified result and one rejected repair. Use the [video script](VIDEO_SCRIPT.md)
      and the actual observed metrics; confirm the submitted file's duration.
- [x] Describe technologies actually used. Do not claim Baseten, Modal or
      Fireworks integration unless the application really uses that provider.
- [x] Preserve the [third-party notices](../THIRD_PARTY.md) and distinguish
      pre-existing components from work completed for this project.
- [ ] Reopen the submitted entry and verify receipt before the deadline.

Only the final portal confirmation establishes that the project was submitted.
A GitHub push, a local successful run or this checklist does not establish receipt.
