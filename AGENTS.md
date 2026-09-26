# Side Picker: guidance for future sessions

Read these files before substantial work:

1. [Application guide](docs/APP_GUIDE.md) — current features, architecture, data flow, and known limitations.
2. [Improvement plan](docs/IMPROVEMENT_PLAN.md) — priorities, acceptance criteria, decisions, and handoff notes.

## Continuing work

- Check the working tree and current code before relying on the documentation. Preserve unrelated changes.
- Use the improvement plan as the durable task record. When asked to continue that plan, start at the first incomplete item whose dependencies and decisions are resolved, within the user's authorized scope.
- The plan records proposed work; its existence does not mean that all implementation or external changes have been requested.
- Keep task IDs stable. Mark a task complete only after implementing it and recording relevant validation. Distinguish code prepared, migration applied, deployed, and verified.
- The user authorized starting the plan on 2026-09-26 and requested a separate commit and push after each improvement. Validate the scoped change and update these documents before each commit; verify Pages when practical.
- Before ending an implementation session, update the plan's Current handoff and Work log with completed work, checks, blockers, and the exact next action. Update the application guide when behavior or architecture changes.
- Use isolated sample data for destructive or write-heavy tests. The checked-in configuration points to the real Supabase project.
- Inspect deployed database state and protect existing data before changing schema or access policies. The legacy schema file contains destructive migration statements; do not run it casually as a health check or reset.
- Never put privileged database keys, scheduler credentials, or user tokens in tracked files. The browser publishable key is intentionally public; authorization must be enforced by the backend.
- Keep the app lightweight and phone-friendly. Validate host and guest flows at narrow widths when changing their UI.

## Quick orientation

Static HTML/CSS/JavaScript hosted on GitHub Pages, with Supabase database and Realtime. There is currently no package manager setup, build step, or checked-in test suite. See the application guide for local startup and the distinction between organizer, guest, and shared-results modes.
