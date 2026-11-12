# Build log

- Task 1: scaffold and tooling. Result: pass. Tests: 3 files, 22 tests passing. Typecheck and build pass. Commit 41ee47a
- Task 2: db adapters and migrations. Result: pass. Tests: 6 files, 34 tests passing (12 new). Typecheck pass. Commit f77548a
- Task 3: domain additions. Result: pass. Tests: 9 files, 57 tests passing (23 new). Typecheck and lint pass. Commit 92e7e61
- Task 4: authentication. Result: pass. Tests: 11 files, 70 passing (13 new). Typecheck and lint pass. Live check against dev server: login 200, bad password 401, cross-origin 403, short new password 422. Commit ac84614
- Task 5: storage, lookups, seed. Result: pass. Tests: 13 files, 85 passing (15 new). `npm run seed` printed pages 148, requisitions 140, lines 424; a second run printed already seeded. Commit bf90805
- Task 6: scans and ai. Result: pass. Tests: 16 files, 99 passing (14 new). Typecheck and lint pass. ai:check skipped, no ANTHROPIC_API_KEY (see DECISIONS.md). Commit bfc7b4a
- Task 7: requisitions. Result: pass. Tests: 17 files, 108 passing (9 new). Typecheck and lint pass. Commit 78d91ce
- Task 8: tracker, matrix, export, master data. Result: pass. Tests: 22 files, 143 passing (35 new). Typecheck, lint and production build pass. Live check on a production server: CSV, XLSX and matrix downloads 200, unauthenticated request 401. Commit ccb481e
- Task 9: shell and dashboard. Result: pass. Tests: unchanged, 22 files, 143 passing. Typecheck, lint and build pass. Live check (production server, seeded data, signed in): / returned 200 with 140, 58, 38, 13, 5 and MFR-000140; no cookie redirects to /login. Commit 7ac52ad
- Task 10: inbox and scan pipeline. Result: pass. Tests: 23 files, 149 passing (6 new). Typecheck, lint and build pass. Browser upload is exercised in Task 14. Commit 5495a34
- Task 11: verify and requisition screens. Result: pass. Tests: 24 files, 161 passing (12 new). Typecheck, lint and build pass. Live check on a production server: a mock-read upload opened on /verify with the duplicate banner naming MFR-000135; /requisitions/1, /requisitions/new and /inbox returned 200. Commit 376c4f6
- Task 12: tracker and matrix pages. Result: pass. Tests unchanged (24 files, 161 passing). Typecheck, lint and build pass. Live check (production server, seeded data): /tracker?crew=MIBS shows 108 lines, 468,104 requested, 399,698 issued; /matrix PB 37 row has 440 and an x2 badge. Commit b647be0
- Task 13: admin pages. Result: pass. Tests: 24 files, 161 passing (three consecutive full runs after raising the Vitest timeouts). Typecheck, lint and build pass. Live check: /admin/parts, ?review=1, /admin/crews, /admin/people, /admin/users all 200 for an admin; creating a user returned a 22 character temporary password once. Commit 4c1110a
