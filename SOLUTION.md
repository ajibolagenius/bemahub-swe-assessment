# SOLUTION.md

**Name:** Ajibola Akelebe  
**Date:** September 12, 2026  
**Actual time spent:** ~165 minutes  

---

## 1. What I completed

| Task | Status | Evidence file |
|---|---|---|
| 1 — Course list | Done | `evidence/task-1-ui.png`, `evidence/task-1-network.png` |
| 2 — Authentication | Done | `evidence/task-2-signedout.png`, `evidence/task-2-signedin.png`, `evidence/task-2-network.png` |
| 3 — Withdrawal form | Done | `evidence/task-3-validation.png`, `evidence/task-3-server-error.png`, `evidence/task-3-success.png`, `evidence/task-3-network.png` |
| 4 — PHP defects | 4 of 4 found | `evidence/task-4-curl.txt` |
| 5 — Database | Done | `answers/task-5.md`, `evidence/task-5-queries.txt`, `database/migrations/002_fix_withdrawal_reference.sql` |
| 6 — Infrastructure | Done | `answers/task-6.md` |
| 7 — Python | Done | `evidence/task-7-output.txt` |

## 2. What I did NOT finish, and how I would approach it

All required core tasks and runtime proofs were implemented and verified.
If given additional time for production readiness, I would:
1. **Automated E2E Tests:** Add automated Playwright integration tests covering the complete withdrawal user flow (from login to successful form submission and balance deduction) (~30 minutes).
2. **Optimistic UI Updates:** Provide optimistic cache updates on the withdrawal request to make the UI balance update instant before server round-trip completes (~15 minutes).

## 3. Task 4 — the defects

For each: what it was, why it is wrong, what you changed, how you proved it.

**Defect 1 (permission):**
- **What it was:** `/me/earnings` used `check_authenticated` in its `permission_callback`, checking only if a user had a valid token but ignoring user roles.
- **Why it is wrong:** Learners were able to access instructor revenue balances with a 200 OK response, violating role-based authorization where non-instructors must receive a 403 Forbidden.
- **What I changed:** Updated `'permission_callback'` on `/me/earnings` to `[$this, 'check_instructor']` in `wordpress-plugin/includes/class-bl-earnings-controller.php`.
- **How I proved it:** Made a `curl -i` request using a learner token before the fix (returned 200 OK) and after the fix (returned 403 Forbidden). See `evidence/task-4-curl.txt`.

**Defect 2 (schema):**
- **What it was:** In `get_course()`, the code accessed `$row->lessons_total`.
- **Why it is wrong:** The database table `wp_bl_courses` defines the column as `lesson_count`, not `lessons_total`. Because the column did not exist on the object, PHP evaluated it to null and quietly returned `"lessonCount": 0` for all courses.
- **What I changed:** Changed `$row->lessons_total` to `$row->lesson_count` in `wordpress-plugin/includes/class-bl-courses-controller.php`.
- **How I proved it:** Sent `GET /courses/1` before fix (returned `lessonCount: 0`) and after fix (returned `lessonCount: 12`, matching the database seed). See `evidence/task-4-curl.txt`.

**Defect 3 (contract):**
- **What it was:** The SQL query in `get_courses()` selected all rows from `wp_bl_courses` without checking `is_published`.
- **Why it is wrong:** The API contract states that only published courses may be returned in the public list. Draft/unpublished courses (`Advanced Laminated Dough`, `id: 5`) were leaked.
- **What I changed:** Added `WHERE c.is_published = 1` to the query in `wordpress-plugin/includes/class-bl-courses-controller.php`.
- **How I proved it:** Sent `GET /courses` before fix (showed 5 courses including unpublished course 5) and after fix (showed exactly 4 published courses). See `evidence/task-4-curl.txt`.

**Defect 4 (validation):**
- **What it was:** In `create_withdrawal()`, only `$amount > $available` was checked. The business rule verifying `$amount >= self::MINIMUM_WITHDRAWAL_MINOR` was completely omitted.
- **Why it is wrong:** Instructors could withdraw arbitrary small sums below the minimum threshold (50,000 minor units). The contract requires a 422 Unprocessable Entity with code `below_minimum`.
- **What I changed:** Added a validation check `if ($amount < self::MINIMUM_WITHDRAWAL_MINOR)` returning a `WP_Error('below_minimum', ..., ['status' => 422])`.
- **How I proved it:** Sent `POST /me/withdrawals` with `amountMinor: 10000` before fix (returned 201 Created) and after fix (returned 422 Unprocessable Entity with code `below_minimum`). See `evidence/task-4-curl.txt`.

## 4. Specific questions

**Task 1: How did you handle `previewExpiresInSeconds`, and why?**  
I passed `staleTime: 300 * 1000` (5 minutes) to React Query. This tells the frontend that course data stays fresh for 5 minutes, after which it automatically refetches in the background so the user never sees stale prices or ratings.

**Task 3: Why must `payoutReference` be generated once per attempt rather than regenerated on retry? What would break?**  
It acts as an idempotency key. If a network glitch happens after the backend saves the withdrawal, retrying with the *same* reference tells the server: "I already asked for this, just give me the receipt." If we made a new reference on every retry, the server would think it's a new withdrawal and pay out the money twice.

**Task 5.2: Why did the unique key fail to prevent duplicates, and why add a new migration rather than editing the old one?**  
In MySQL, `NULL` is never equal to another `NULL`. Because `cancelled_at` allows NULL, multiple pending withdrawals with `cancelled_at = NULL` are never flagged as duplicates by the unique key. We use a new migration (`002`) because migration `001` was already run in the database; editing an old migration doesn't update existing tables and messes up migration history for teammates.

**Task 7: `"fee_minor": null` — zero fee, or error? Why?**  
I treated it as zero (`fee = 0`). In real-world payment exports, some transactions have zero provider fees or waived fees, which export as `null`. Defaulting to 0 lets the math (`amount - 0 = amount`) work cleanly instead of crashing the whole batch.

## 5. Anything wrong in our brief

In `wordpress-plugin/includes/class-bl-courses-controller.php`, line 1 had an accidental ` open<?php` instead of `<?php`. Because text was printed before the PHP tag opened, WordPress couldn't send proper JSON headers (it defaulted to `text/html`), and every API response had `" open"` printed at the beginning. Deleting that stray text fixed the headers and restored the exact file checksum in `CHECKSUMS.sha256`.

## 6. AI Tool Usage — required

**Which tools did you use?**  
Antigravity coding assistant (Gemini model), paired with my own open-source security tool **`secure-me`** ([vibe-secure-me](https://github.com/ajibolagenius/vibe-secure-me)).

### Human-led, AI-assisted approach:
I reviewed the requirements, traced the code paths, ran the local containers, and verified all solutions myself. AI was used strictly in an **assistive capacity**:
1. **Formatting & Documentation:** Used AI to quickly draft consistent markdown tables, curl log structures, and templates, saving manual typing time.
2. **Initial Code Walkthrough:** After my own manual pass through the files, I used AI to quickly cross-check file locations and summarize the problem areas.
3. **Security Review with `secure-me`:** I ran **`secure-me`** ([github.com/ajibolagenius/vibe-secure-me](https://github.com/ajibolagenius/vibe-secure-me)), an agentic security audit skill that **I created**, to check the repository for sensitive data exposure, ensure bearer tokens were redacted from all screenshots, and verify role-based permissions on money endpoints.

### 6a. Where AI was used

| Task | What AI assisted with | Accepted / rejected / modified |
|---|---|---|
| Review & Brief | Summarizing initial file layout after my human review | Accepted for quick orientation. |
| Tasks 1–3 (Frontend) | Providing quick component scaffolding for React Query and Zod | Modified; simplified the code to keep it minimal and beginner-friendly. |
| Task 4 (PHP) | Helping format before/after curl comparisons | Accepted; kept minimal 1-line defect fixes. |
| Task 5 (Database) | Formatting SQL query outputs for documentation | Accepted after testing queries directly in MySQL CLI. |
| Task 6 (Infrastructure) | Formatting incident triage answers | Modified into clean, practical steps. |
| Task 7 (Python) | Formatting exception handling snippet | Accepted; verified with missing file test. |
| Security Check | Running `secure-me` security audit | Accepted; ensured tokens are masked in evidence. |

### 6b. What you accepted or rejected, and why
- **Accepted:** Using AI to speed up documentation, markdown table formatting, and basic boilerplate.
- **Rejected:** Overly complicated abstractions. For instance, AI suggested complex multi-step custom form hooks; I rejected them in favor of straightforward, standard `react-hook-form` + `zod` code that is easy to read, test, and explain.
- **Rejected:** Any changes that modified unrelated files or added unneeded packages.

### 6c. What you verified yourself, and how
- **Task 4:** Ran `curl -i` in my terminal for both `instructor` and `learner` accounts to verify the exact status codes (403 vs 200) and response bodies before and after fixes.
- **Task 5:** Tested the duplicate insert directly in MySQL CLI, ran the migration `002`, and confirmed the database rejected duplicates with `ERROR 1062`.
- **Task 7:** Ran `reconcile_earnings.py` with real and missing files, verifying exit codes `0` and `2` with `echo $?`.
- **Frontend:** Ran `npm run typecheck` and `npm run build` to ensure clean builds, and tested the pages live in the browser on `http://localhost:3000`.

### 6d. Assumptions you made
- Assumed the withdrawal form amount input represents minor units (integers) to match the backend API contract directly.
- Assumed removing the stray ` open` string in `class-bl-courses-controller.php` was necessary to restore valid `application/json` responses.

## 7. Assumptions and trade-offs
- **Form Input:** Kept the input field in minor units to avoid float rounding mistakes, with helpful labels showing the converted Naira amount.
- **Forward Migration:** Cleaned up existing duplicates before adding the new unique constraint so the migration wouldn't fail on existing data.

## 8. If this went to production tomorrow
- **Transaction Locking:** For heavy traffic, wrap withdrawal balance checks in a database transaction with row locking (`FOR UPDATE`) to prevent simultaneous requests from overdrafting.
- **Environment Secrets:** Move database and admin passwords from docker-compose into a secure secrets manager.
- **Automated CI:** Set up a simple GitHub Actions workflow to run typechecks, builds, and tests on every pull request.
