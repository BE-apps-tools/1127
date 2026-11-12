# Build log

- Task 1: scaffold and tooling. Result: pass. Tests: 3 files, 22 tests passing. Typecheck and build pass. Commit 41ee47a
- Task 2: db adapters and migrations. Result: pass. Tests: 6 files, 34 tests passing (12 new). Typecheck pass. Commit f77548a
- Task 3: domain additions. Result: pass. Tests: 9 files, 57 tests passing (23 new). Typecheck and lint pass. Commit 92e7e61
- Task 4: authentication. Result: pass. Tests: 11 files, 70 passing (13 new). Typecheck and lint pass. Live check against dev server: login 200, bad password 401, cross-origin 403, short new password 422. Commit ac84614
- Task 5: storage, lookups, seed. Result: pass. Tests: 13 files, 85 passing (15 new). `npm run seed` printed pages 148, requisitions 140, lines 424; a second run printed already seeded. Commit bf90805
- Task 6: scans and ai. Result: pass. Tests: 16 files, 99 passing (14 new). Typecheck and lint pass. ai:check skipped, no ANTHROPIC_API_KEY (see DECISIONS.md). Commit bfc7b4a
