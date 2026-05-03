-- When a contract row is deleted (e.g. from Table Editor), denormalized tenant_* on apartments
-- is NOT cleared by FK alone. This BEFORE DELETE trigger clears the active lease snapshot on the
-- apartment row only when that row still points at the contract being removed.
--
-- Run in Supabase SQL Editor in TWO steps if one block fails:
--   1) Run everything from "Step 1" through the end of the function (down to $fn$;)
--   2) Run "Step 2" (DROP TRIGGER + CREATE TRIGGER)

-- ========== Step 1: function ==========
CREATE OR REPLACE FUNCTION public.trg_clear_apartment_tenant_on_contract_delete_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  UPDATE public.apartments
  SET
    tenant_user_id = NULL,
    tenant_national_id = NULL,
    tenant_info = NULL,
    current_contract_id = NULL,
    lease_status = 'vacant',
    maintenance_id = NULL
  WHERE id = OLD.apartment_id
    AND current_contract_id IS NOT DISTINCT FROM OLD.id;
  RETURN OLD;
END;
$fn$;

-- ========== Step 2: trigger ==========
DROP TRIGGER IF EXISTS trg_clear_apartment_tenant_on_contract_delete ON public.contracts;

CREATE TRIGGER trg_clear_apartment_tenant_on_contract_delete
  BEFORE DELETE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_clear_apartment_tenant_on_contract_delete_fn();
-- If you get "syntax error" on EXECUTE FUNCTION (older Postgres), use instead:
-- EXECUTE PROCEDURE public.trg_clear_apartment_tenant_on_contract_delete_fn();
