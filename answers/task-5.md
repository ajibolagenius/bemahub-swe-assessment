# Task 5 — Database

> Paste the **terminal output** of every query, not just the SQL. For this task
> the output is the answer.

## 5.1 Investigate — NULL vs 0

```sql
SELECT 
    id, 
    title, 
    enrolment_count, 
    (enrolment_count IS NULL) AS enrolment_is_null,
    average_rating, 
    (average_rating IS NULL) AS rating_is_null
FROM wp_bl_courses
ORDER BY id;
```

```
+----+------------------------------+-----------------+-------------------+----------------+----------------+
| id | title                        | enrolment_count | enrolment_is_null | average_rating | rating_is_null |
+----+------------------------------+-----------------+-------------------+----------------+----------------+
|  1 | Introduction to Bread Baking |             128 |                 0 |           4.60 |              0 |
|  2 | Sourdough Starters           |              64 |                 0 |           4.20 |              0 |
|  3 | Pastry Fundamentals          |            NULL |                 1 |           NULL |              1 |
|  4 | Cake Decorating Basics       |               9 |                 0 |           0.00 |              0 |
|  5 | Advanced Laminated Dough     |               0 |                 0 |           NULL |              1 |
+----+------------------------------+-----------------+-------------------+----------------+----------------+
```

**Which rows are genuinely 0, and which are NULL?**
- **Enrolment count:** Course ID 5 (`Advanced Laminated Dough`) has a genuine measured `0` enrolments. Course ID 3 (`Pastry Fundamentals`) has `NULL` (uncounted / not yet measured).
- **Average rating:** Course ID 4 (`Cake Decorating Basics`) has a genuine measured rating of `0.00`. Course ID 3 (`Pastry Fundamentals`) and Course ID 5 (`Advanced Laminated Dough`) have `NULL` (no ratings submitted yet).

**Why does this matter to a user?** (two sentences)
A rating of 0.00 means learners reviewed the course and rated it very poorly, whereas NULL means the course is new and simply has not received any reviews yet. Displaying NULL as 0 misleads prospective students into believing an unreviewed course has a terrible reputation, directly damaging the instructor's sales and credibility.

## 5.2 The constraint

**Proof — two inserts with the same instructor_id and payout_reference:**

```sql
INSERT INTO wp_bl_withdrawals (instructor_id, amount_minor, status, payout_reference, cancelled_at)
VALUES (2, 50000, 'pending', 'ref_duplicate_test', NULL);

INSERT INTO wp_bl_withdrawals (instructor_id, amount_minor, status, payout_reference, cancelled_at)
VALUES (2, 50000, 'pending', 'ref_duplicate_test', NULL);

SELECT id, instructor_id, amount_minor, status, payout_reference, cancelled_at 
FROM wp_bl_withdrawals 
WHERE payout_reference = 'ref_duplicate_test';
```

```
Query OK, 1 row affected (0.01 sec)

Query OK, 1 row affected (0.00 sec)

+----+---------------+--------------+---------+--------------------+--------------+
| id | instructor_id | amount_minor | status  | payout_reference   | cancelled_at |
+----+---------------+--------------+---------+--------------------+--------------+
|  1 |             2 |        50000 | pending | ref_duplicate_test | NULL         |
|  2 |             2 |        50000 | pending | ref_duplicate_test | NULL         |
+----+---------------+--------------+---------+--------------------+--------------+
2 rows in set (0.00 sec)
```

**Did the unique key prevent the duplicate? If not, exactly why?**
No, the unique key did not prevent the duplicate. Under standard SQL and MySQL InnoDB B-tree indexes, a `NULL` value indicates an unknown value, so `NULL` is never considered equal to another `NULL` (`NULL != NULL`). Because `cancelled_at` is nullable and both inserted records had `cancelled_at IS NULL`, the composite index `(instructor_id, payout_reference, cancelled_at)` treated each row as distinct, permitting multiple pending payouts with identical references.

### The fix — `database/migrations/002_fix_withdrawal_reference.sql`

**Why a new migration rather than editing `001_initial.sql`:** (one line)
Migration 001 has already run in production environments; altering historical migrations does not update existing databases and breaks migration tracking for other team members.

**Applying it:**

```
$ mysql -u bemalearn -passessment bemalearn < database/migrations/002_fix_withdrawal_reference.sql
Query OK, 1 row affected (0.01 sec)
Query OK, 0 rows affected (0.02 sec)
Records: 0  Duplicates: 0  Warnings: 0
Query OK, 0 rows affected (0.03 sec)
Records: 0  Duplicates: 0  Warnings: 0
```

**`SHOW CREATE TABLE wp_bl_withdrawals;` afterwards:**

```
*************************** 1. row ***************************
       Table: wp_bl_withdrawals
Create Table: CREATE TABLE `wp_bl_withdrawals` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `instructor_id` bigint unsigned NOT NULL,
  `amount_minor` int unsigned NOT NULL,
  `status` varchar(32) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT 'pending',
  `payout_reference` varchar(64) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reference` (`instructor_id`,`payout_reference`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci
```

**The duplicate insert, re-run and now rejected:**

```
$ mysql -u bemalearn -passessment bemalearn -e "
INSERT INTO wp_bl_withdrawals (instructor_id, amount_minor, status, payout_reference, cancelled_at)
VALUES (2, 50000, 'pending', 'ref_duplicate_test', NULL);"

ERROR 1062 (23000) at line 2: Duplicate entry '2-ref_duplicate_test' for key 'wp_bl_withdrawals.uq_reference'
```

## 5.3 The join

```sql
SELECT 
    c.title,
    COUNT(e.id) AS non_refunded_enrolments,
    COALESCE(SUM(e.amount_paid_minor), 0) AS total_revenue_minor
FROM wp_bl_courses c
LEFT JOIN wp_bl_enrolments e 
    ON e.course_id = c.id 
    AND e.refunded_at IS NULL
GROUP BY c.id, c.title
ORDER BY c.id;
```

```
+------------------------------+-------------------------+---------------------+
| title                        | non_refunded_enrolments | total_revenue_minor |
+------------------------------+-------------------------+---------------------+
| Introduction to Bread Baking |                       2 |                9000 |
| Sourdough Starters           |                       0 |                   0 |
| Pastry Fundamentals          |                       0 |                   0 |
| Cake Decorating Basics       |                       0 |                   0 |
| Advanced Laminated Dough     |                       0 |                   0 |
+------------------------------+-------------------------+---------------------+
5 rows in set (0.00 sec)
```

**Which join type did you use, and what would break with the other one?**
I used a `LEFT JOIN` with the non-refunded check (`e.refunded_at IS NULL`) inside the `ON` condition. If an `INNER JOIN` were used instead, any course with zero enrolments (or whose enrolments were all refunded) would be completely excluded from the result table instead of appearing with `0` enrolments and `0` revenue as required.
