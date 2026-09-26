# GB Update Tracker

This directory implements the GB Update Tracker dashboard. Follow the refresh, validation, publishing, and bootstrap-compatibility instructions in [README.md](README.md#refresh-the-great-building-dashboard).

- Run `python3 -B -u -m foe_cdn_inspector refresh` from this directory for data-refresh requests. The default workflow maintains GBP descriptions since March 1, 2026 and a rolling 60-day history.
- Preserve cached reports and dated snapshots. Check the successful report and generated dashboard before reporting completion.
- Repair upstream format changes in the parser with regression coverage; retain beta-market verification and never evaluate remote JavaScript.
- Publish only when requested, using ticket `FOE-51` unless the user supplies another key and explicit paths for both dashboard HTML files and related changes. Leave unrelated work untouched.
