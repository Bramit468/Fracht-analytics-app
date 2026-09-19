# Trip saving (#10)

Apply `supabase/migrations/0004_save_trip_with_legs.sql` after migrations 0001–0003.
The function uses caller permissions (RLS) and writes both tables in one transaction.
It returns actual database identifiers for the trip and country legs.

Manual verification with a development database:
1. Open `/trips/new`; confirm the truck and country lists load from Supabase.
2. Fill all fields and country distances; click Calculate, then Save Trip.
3. Confirm success and matching rows in `trips` and `trip_country_legs`.
4. Confirm invalid country/distance input does not report success.
5. Test a failing RPC in a database transaction; confirm no partial trip remains.

The UI disables saving while a request is pending and after success until edited.
If the network drops after a write, verify the database before retrying: request
idempotency is not implemented yet. Saved results use current truck/tariff values;
this change does not add historical cost snapshots or a trip list.
