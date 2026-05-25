CREATE SEQUENCE IF NOT EXISTS public.receipt_no_seq START 1;

GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.receipt_no_seq TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_receipt_no() TO authenticated, anon, service_role;