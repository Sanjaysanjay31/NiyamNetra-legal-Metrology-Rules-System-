# Seed guard (FIX 4.8) — seed.py 275 lines
Only run when ENV != prod; guard with if settings.ENV == 'dev': seed.run(). Never seed on production DB.
