# DB migration SQLite→PostgreSQL (FIX 4.6)
Config references postgresql+psycopg. Steps: 1) alembic upgrade to postgres; 2) export niyamnetra.db; 3) update DATABASE_URL in .env; 4) verify with tests/test_core.py.
