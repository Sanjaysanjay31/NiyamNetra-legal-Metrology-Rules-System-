# DB migrations — NiyamNetra

Chain: `0001` (initial schema + triggers) → `0002` (listing_url/text/platform flag for CHK15/16) → `0003` (reference_pixel_size for scale reproducibility).

Fresh DBs: `0001` runs `Base.metadata.create_all`, so new columns already exist; `0002`/`0003` use try/except add_column and are no-ops.

Existing DBs (Supabase/prod): run `alembic upgrade head` after pull. Verify: `alembic history`, then `pytest -q` (23 tests).

SQLite → PostgreSQL move: 1) `alembic upgrade head` against postgres DATABASE_URL; 2) export rows from niyamnetra.db if needed; 3) update DATABASE_URL in .env to `postgresql+psycopg://...`; 4) verify with `pytest -q`.
