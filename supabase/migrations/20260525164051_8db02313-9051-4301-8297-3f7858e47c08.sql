
-- Add 'student' to role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'student';

-- Add admission_no and auth_user_id to students
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS admission_no text,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS students_admission_no_key
  ON public.students (admission_no) WHERE admission_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS students_auth_user_id_key
  ON public.students (auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS students_phone_idx ON public.students (phone);

-- Update handle_new_user to honor metadata role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  is_first boolean;
  meta_role text;
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));

  meta_role := new.raw_user_meta_data->>'role';

  if meta_role = 'student' then
    insert into public.user_roles (user_id, role) values (new.id, 'student');
  else
    select count(*) = 0 into is_first from public.user_roles where role = 'admin';
    if is_first then
      insert into public.user_roles (user_id, role) values (new.id, 'admin');
    else
      insert into public.user_roles (user_id, role) values (new.id, 'user');
    end if;
  end if;

  return new;
end;
$function$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Students: students can view their own row
DROP POLICY IF EXISTS "Students: own select" ON public.students;
CREATE POLICY "Students: own select"
  ON public.students FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- Fee payments: students can view their own payments
DROP POLICY IF EXISTS "Payments: own select" ON public.fee_payments;
CREATE POLICY "Payments: own select"
  ON public.fee_payments FOR SELECT
  TO authenticated
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE auth_user_id = auth.uid()
    )
  );
