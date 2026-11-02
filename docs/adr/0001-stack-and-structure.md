# 1. Stack and repository structure

Date: 2026-11-02 · Status: accepted

## Decisions

| Area        | Choice                                       | Why                                                                                                                         |
| ----------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| API         | NestJS 12 (TypeScript, ES modules)           | Modules map to bounded contexts (Identity, Catalogue, Ordering…); guards make server-side authorisation the default.        |
| Web         | Next.js 16                                   | Server rendering for the catalogue; session checks on the server before a page renders.                                     |
| Database    | PostgreSQL 17                                | Row locks for stock, CHECK constraints for invariants, partial indexes, JSONB for outbox and audit payloads.                |
| Data access | Prisma 7 with the `pg` driver adapter        | Typed client and versioned SQL migrations. Raw SQL inside transactions where locking matters (stock).                       |
| Messaging   | AWS SQS; LocalStack locally                  | Native dead-letter queues and redrive; same API locally and on AWS.                                                         |
| Sessions    | Server-side sessions in Postgres             | Revocation is immediate (sign-out, password reset, suspension); the cookie carries a random token, only its hash is stored. |
| Repo        | npm workspaces monorepo                      | One pipeline; shared validation and message contracts compiled once.                                                        |
| Deployment  | Own Kubernetes cluster on AWS EC2, Terraform | Postgres runs in the cluster; SQS from AWS. Infrastructure as code from day one.                                            |
| CI/CD       | GitHub Actions                               | Lint, types, unit and end-to-end tests against real Postgres, SQS and SMTP on every push.                                   |

## Notes

- Nest 12 ships only as ES modules, so every package is `"type": "module"` and tests use Vitest.
- TypeScript is pinned to 6.x; Nest’s tooling targets it. Revisit when Nest supports TypeScript 7.
- Phone numbers are stored in E.164 (`+923001234567`) with a unique index, so different spellings of one number count as the same.
