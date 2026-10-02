# ADR 0006: Isolated synthetic staging

Status: Accepted

## Decision

Program B uses a dedicated Firebase project whose ID explicitly identifies it as staging. B1 accepts only synthetic, production-shaped data. Staging builds validate the project identity, matching auth domain, App Check registration, and observability settings before building. Live deploys require an exact repeated project-ID confirmation and explicitly target that project.

Firebase App Check begins in monitoring mode and may move to enforcement only after legitimate synthetic flows consistently present valid tokens. Firestore Security Rules remain authoritative. Long-lived service-account keys are not committed or stored in Vite configuration; future automated deployment uses short-lived workload identity where available.

## Consequences

- A staging build cannot silently target a project without an explicit staging identity.
- Cloud provisioning waits for owner authentication and approval of the permanent Firestore location.
- Real child data cannot be used to accelerate B1 or B2.
- App Check, budget/no-billing status, retention ownership, and rollback evidence are operational exit gates rather than documentation promises.
- Production credentials and source activation remain outside Program B1.
