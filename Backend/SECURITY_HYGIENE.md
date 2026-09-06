# Secret hygiene — applied 2026-09-06
- Rotate JWT_SECRET (see .env note)
- Check git log for .env commits; if present, use git filter-repo / BFG
- Add .env to .gitignore (already present)
- Use .env.example only in repo
