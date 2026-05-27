
-- Class-wise monthly fee structure
CREATE TABLE public.fee_structure (
  class_name text PRIMARY KEY,
  monthly_fee numeric NOT NULL CHECK (monthly_fee >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fee_structure TO authenticated;
GRANT ALL ON public.fee_structure TO service_role;

ALTER TABLE public.fee_structure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fee structure: read for authenticated"
  ON public.fee_structure FOR SELECT TO authenticated USING (true);
CREATE POLICY "Fee structure: admin insert"
  ON public.fee_structure FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Fee structure: admin update"
  ON public.fee_structure FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Fee structure: admin delete"
  ON public.fee_structure FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Add billing start month/year to students
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS start_year int,
  ADD COLUMN IF NOT EXISTS start_month int CHECK (start_month BETWEEN 1 AND 12);

-- Backfill from created_at
UPDATE public.students
  SET start_year = EXTRACT(YEAR FROM created_at)::int,
      start_month = EXTRACT(MONTH FROM created_at)::int
  WHERE start_year IS NULL OR start_month IS NULL;

-- Join table: which months each payment covered
CREATE TABLE public.fee_period_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.fee_payments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  period_year int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  amount numeric NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, period_year, period_month)
);

CREATE INDEX idx_fpp_student ON public.fee_period_payments(student_id);
CREATE INDEX idx_fpp_payment ON public.fee_period_payments(payment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_period_payments TO authenticated;
GRANT ALL ON public.fee_period_payments TO service_role;

ALTER TABLE public.fee_period_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "FPP: admin all select"
  ON public.fee_period_payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "FPP: admin insert"
  ON public.fee_period_payments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "FPP: admin update"
  ON public.fee_period_payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "FPP: admin delete"
  ON public.fee_period_payments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "FPP: student own select"
  ON public.fee_period_payments FOR SELECT TO authenticated
  USING (student_id IN (SELECT id FROM public.students WHERE auth_user_id = auth.uid()));

-- Helper SQL: returns one row per billable month (year, month, due, paid, status)
-- Deadline rule: a month is "pending" once today is past the 15th of that month.
CREATE OR REPLACE FUNCTION public.student_fee_status(_student_id uuid)
RETURNS TABLE (
  period_year int,
  period_month int,
  due numeric,
  paid numeric,
  status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s_class text;
  s_start_year int;
  s_start_month int;
  monthly numeric;
  today date := CURRENT_DATE;
  cur_y int;
  cur_m int;
BEGIN
  SELECT class_name, COALESCE(start_year, EXTRACT(YEAR FROM created_at)::int),
         COALESCE(start_month, EXTRACT(MONTH FROM created_at)::int)
    INTO s_class, s_start_year, s_start_month
  FROM students WHERE id = _student_id;

  IF s_class IS NULL THEN RETURN; END IF;

  SELECT monthly_fee INTO monthly FROM fee_structure WHERE class_name = s_class;
  IF monthly IS NULL THEN monthly := 0; END IF;

  cur_y := s_start_year;
  cur_m := s_start_month;

  WHILE (cur_y < EXTRACT(YEAR FROM today)::int)
        OR (cur_y = EXTRACT(YEAR FROM today)::int AND cur_m <= EXTRACT(MONTH FROM today)::int) LOOP
    period_year := cur_y;
    period_month := cur_m;
    due := monthly;
    SELECT COALESCE(SUM(amount), 0) INTO paid
      FROM fee_period_payments
      WHERE student_id = _student_id AND fee_period_payments.period_year = cur_y AND fee_period_payments.period_month = cur_m;

    IF paid >= due AND due > 0 THEN
      status := 'paid';
    ELSIF paid > 0 THEN
      status := 'partial';
    ELSE
      -- Pending only if past the 15th of that month (or earlier months)
      IF (cur_y < EXTRACT(YEAR FROM today)::int)
         OR (cur_y = EXTRACT(YEAR FROM today)::int AND cur_m < EXTRACT(MONTH FROM today)::int)
         OR (cur_y = EXTRACT(YEAR FROM today)::int AND cur_m = EXTRACT(MONTH FROM today)::int AND EXTRACT(DAY FROM today)::int > 15) THEN
        status := 'pending';
      ELSE
        status := 'upcoming';
      END IF;
    END IF;

    RETURN NEXT;

    cur_m := cur_m + 1;
    IF cur_m > 12 THEN cur_m := 1; cur_y := cur_y + 1; END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.student_fee_status(uuid) TO authenticated, service_role;
