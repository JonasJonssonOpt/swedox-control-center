# Modulstatus

## Syfte

Tabellen ger en gemensam överblick över Control Centers moduler. Status uppdateras först när en verifierbar förändring har genomförts och dokumenterats.

| Modul          | Status               | Kommentar                                                                                                                                                             |
| -------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication | Ej påbörjad          | Version 1 är beslutad: ett `owner`-konto, e-post/lösenord och obligatorisk TOTP-MFA. Ingen autentisering är införd.                                                   |
| Authorization  | Ej påbörjad          | Endast aktiv `owner`-behörighet ingår i version 1. Ingen auktorisering är införd.                                                                                     |
| Customers      | Delvis implementerad | Ownerintegritet, tenantdatabas, RLS, audit, DAL/service, routes/actions samt list/detail/create/edit/livscykel-UI är lokalverifierade. Bootstrap och audit-UI saknas. |
| Installations  | Ej påbörjad          | Installationshantering är inte införd.                                                                                                                                |
| Licenses       | Ej påbörjad          | Licenshantering är inte införd.                                                                                                                                       |
| Versions       | Ej påbörjad          | Versionshantering är inte införd.                                                                                                                                     |
| Operations     | Ej påbörjad          | Driftfunktioner är inte införda.                                                                                                                                      |
| Support        | Ej påbörjad          | Supportfunktioner är inte införda.                                                                                                                                    |
| Health         | Ej påbörjad          | Health-funktioner är inte införda.                                                                                                                                    |
| Audit          | Delvis implementerad | Append-only schema, atomisk mutationsintegration och paginerad ownerkontrollerad läsfunktion är lokalverifierade. Retention och operativ export/backup återstår.      |
| Backups        | Ej påbörjad          | Backupfunktioner är inte införda.                                                                                                                                     |
| Billing        | Ej påbörjad          | Billingfunktioner är inte införda.                                                                                                                                    |

## Relaterade dokument

- [Control Center Roadmap](CONTROL_CENTER_ROADMAP.md)
- [Projektbeslut](PROJECT_DECISIONS.md)
- [Security Standard](SECURITY_STANDARD.md)
- [Databas- och migrationsflöde](DATABASE_WORKFLOW.md)
- [Tenant Database Design](TENANT_DATABASE_DESIGN.md)
