# Upgrade: Month-wise Fee Collection System

## 1. Database changes (single migration)

**New tables**

- `fee_structure`
  - `class_name text primary key`
  - `monthly_fee numeric not null check (monthly_fee >= 0)`
  - `updated_at timestamptz`
  - RLS: admin full access, authenticated SELECT (students need it to view their own dues).

- `fee_period_payments` (join table — which months each payment covers)
  - `id uuid pk`
  - `payment_id uuid` → `fee_payments.id` (cascade delete)
  - `student_id uuid` → `students.id`
  - `period_year int`, `period_month int (1-12)`
  - `amount numeric` (fee allocated to that month)
  - unique `(student_id, period_year, period_month)` — prevents double-paying the same month
  - RLS: admin full; student SELECT own (via `students.auth_user_id = auth.uid()`).

**Students table**
- Add `start_year int`, `start_month int` (defaults to enrollment month) — used as the first billable month. Backfill from `created_at` for existing rows.

**Keep existing**
- `students.total_fee` is retained (lump sum legacy) but no longer drives logic. Form still allows entering it as optional notes.
- `fee_payments` unchanged (receipt/amount/mode). New table just attributes payment to months.

**Helper SQL function** `public.student_fee_status(_student_id uuid)` returning a table of `(year, month, due, paid, status)` — computed from `fee_structure.monthly_fee` for the student's class, billable months between `(start_year, start_month)` and today (with 15th-of-month deadline rule), minus sum of `fee_period_payments`. Used by both admin collect page and student portal.

## 2. Backend / server functions

- `src/lib/fees.functions.ts`
  - `getStudentFeeStatus({ studentId })` — wraps the SQL helper; returns months array, totals, last payment date.
  - `collectFee({ studentId, months: [{year,month}], paymentMode, paidOn, note })` — runs in a transaction: inserts `fee_payments` row for `sum(monthly_fee * months)`, then inserts `fee_period_payments` rows. Returns payment id + receipt no.
  - Admin-only (uses `requireSupabaseAuth` + admin check).
- `searchStudents({ q })` — server fn that returns up to 50 students matching name / admission_no / phone using `ilike`. Used by combobox.

## 3. UI

- **Collect Fee page** (`/collect`)
  - Replace `Select` with shadcn `Command`-based searchable combobox (debounced search calling `searchStudents`).
  - On select, show a status card: name, class, monthly fee, total pending, last payment date, paid/unpaid month chips (green/red/yellow badges).
  - Month picker: list of unpaid months as toggleable chips. "Pay Full Pending Fee" button selects all unpaid.
  - Total auto-computed from selected months × class monthly fee. Amount field becomes read-only display (editable only for partial — keep simple, full month payments only in v1).
  - Submit calls `collectFee` server fn; navigates to existing receipt page.

- **Settings page** — add "Class Fee Structure" section: list of classes with editable monthly fee inputs; add new class row; save via admin upsert into `fee_structure`.

- **Student portal `/me`** — add month-wise status grid using `getStudentFeeStatus` (RLS-scoped so student sees only own).

## 4. Responsive / styling
- Use existing design tokens, Tailwind for grid of month chips (3-cols mobile, 6-cols desktop).
- Badge colors: `bg-emerald-500/15 text-emerald-700` paid, `bg-red-500/15 text-red-700` pending, `bg-amber-500/15 text-amber-700` partial.

## 5. Backwards compatibility
- Existing receipts continue to render — they read from `fee_payments` directly.
- Old `total_fee` field left intact; new logic only kicks in when class has an entry in `fee_structure`. If a student's class has no fee structure row, the status panel shows "Set monthly fee for class X in Settings".
- Auth / login / receipt routes untouched.

## Files to add/edit
- new: `supabase/migrations/<ts>_monthwise_fees.sql`
- new: `src/lib/fees.functions.ts`
- new: `src/components/student-combobox.tsx`
- new: `src/components/month-status-grid.tsx`
- edit: `src/routes/_authenticated/collect.tsx`
- edit: `src/routes/_authenticated/settings.tsx` (add fee-structure section)
- edit: `src/routes/_authenticated/me.tsx` (show month-wise status)
- edit: `src/lib/students.functions.ts` (add `searchStudents`)

After you approve, I'll write the migration first (needs your confirmation), then ship the code.
