# Proposal: daily full-trip snapshot with a tested restore

Status: November 16, 2026. **A proposal for the organizer to approve. Nothing
here is switched on.** No schedule, no storage bucket, no secret and no
background job has been created. Follows `docs/review-1.md` section 5.

## Why

History and undo fix one accidental edit. They live in the same database as the
trip, so they do not help if the database itself is lost or damaged, or if a
mistake is only noticed days later. A daily copy kept somewhere else covers that.

## What exists today (already usable, manual)

- The snapshot format, in `public/backup.mjs`: one JSON file per trip with the
  whole trip document, its revision, the full change log and a SHA-256
  checksum. It holds no editor emails, owner identity or guest-link tokens.
- **Download full backup** in History (organizer only), which produces that file.
- The restore: **Import JSON** recognises the file, verifies the checksum, and
  creates a separate new trip from it. It never overwrites the live trip.
- Tests: a snapshot written out and read back reproduces the trip exactly; an
  edited, truncated or foreign file is refused; over HTTP, an activity deleted
  after the backup is present again in the restored trip.

Until a schedule is approved, the dependable routine is: download a full backup
before the single-stay event and after any big planning session.

## What a restore does and does not bring back

It brings back every record of the trip as it was at the snapshot. It becomes a
new trip owned by whoever imports it. Editors must be re-added, the guest link
re-enabled, and the old trip's History stays with the old trip (the file keeps a
copy of it for reference).

## Proposed daily job

Once a day, for each trip that is not archived, write
`<tripId>/<YYYY-MM-DD>.json` in the format above to private storage, then delete
snapshots older than 30 days (`expiredSnapshots`, tested). A trip whose revision
has not changed since the last snapshot can be skipped.

| Option | How | Trade-off |
| --- | --- | --- |
| A. Sites storage + Sites schedule | Attach object storage (`r2` in `.openai/hosting.json`) and a scheduled handler | Least to run, but only if Sites supports scheduled Workers and private object storage. This is unconfirmed and must be checked first. Copies sit with the same provider as the database. |
| B. External scheduler pulling a snapshot (recommended to try first) | A daily GitHub Actions job in a **private** repository calls a new token-protected export endpoint and stores the file as a private artifact or in a private bucket | Independent of the host, so it survives a Sites problem. Needs one long random secret stored in Sites and in the scheduler, and a new read-only endpoint. The hosting edge refused command-line requests in earlier checks (403), so reachability must be proven before relying on it. |
| C. Worker Cron Trigger + R2 | Only if the app moves to an owner-controlled Cloudflare account | Clean and cheap, but depends on a host migration that has not been approved. |

## Decisions needed from the organizer

1. Approve a daily automatic snapshot at all, or stay with manual downloads.
2. Where copies may live (option A, B or C), and who can read that place.
3. Retention: 30 days is proposed.
4. Whether snapshots may include the editor email list. Leaving it out (as now)
   keeps emails out of the copies but means re-adding editors after a restore.

## Before it could be called working

- Prove the scheduler can reach the Site and that storage is private.
- Run it for several days and confirm a file per trip per day and that old
  files are removed.
- Do one full restore from a stored file on the hosted Site and compare it with
  the live trip.
- Write down who gets told when a run fails.

None of these have been done.
