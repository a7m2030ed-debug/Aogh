# Car parts marketplace app — start here

This repo's existing root files (`README.md`, `*.html`, `build_pages.py`)
belong to an unrelated project (branch-report dashboards). The used-car-parts
marketplace mobile app lives in two new, separate directories added on the
`claude/mobile-app-gqyrfz` branch:

- **`backend/`** — NestJS API (modular monolith) + Prisma/PostgreSQL schema.
  See `backend/README.md` to run it and to see what's built vs. still a TODO.
- **`mobile/`** — Flutter app skeleton (customer + dealer). See
  `mobile/README.md` — it hasn't been run through the Flutter SDK yet.
- **`docs/project-brief.md`** — what the client asked for, what the code
  does about it, and the decisions still open (app name, branding, launch
  city, which external-service providers to use, legal review).
