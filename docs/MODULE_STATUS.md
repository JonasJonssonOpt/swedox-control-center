# Modulstatus

## Syfte

Tabellen ger en gemensam överblick över Control Centers moduler. Status uppdateras först när en verifierbar förändring har genomförts och dokumenterats.

| Modul          | Status               | Kommentar                                                                                                                                                                            |
| -------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication | Ej påbörjad          | Version 1 är beslutad: ett `owner`-konto, e-post/lösenord och obligatorisk TOTP-MFA. Ingen autentisering är införd.                                                                  |
| Authorization  | Ej påbörjad          | Endast aktiv `owner`-behörighet ingår i version 1. Ingen auktorisering är införd.                                                                                                    |
| Customers      | Delvis implementerad | Ownerintegritet och tenantdatabasens grundstruktur är lokalverifierade. Bootstrap, routekoppling, tenant-RLS, audit, mutationer, DAL och UI saknas; modulen är inte verksamhetsklar. |
| Installations  | Ej påbörjad          | Installationshantering är inte införd.                                                                                                                                               |
| Licenses       | Ej påbörjad          | Licenshantering är inte införd.                                                                                                                                                      |
| Versions       | Ej påbörjad          | Versionshantering är inte införd.                                                                                                                                                    |
| Operations     | Ej påbörjad          | Driftfunktioner är inte införda.                                                                                                                                                     |
| Support        | Ej påbörjad          | Supportfunktioner är inte införda.                                                                                                                                                   |
| Health         | Ej påbörjad          | Health-funktioner är inte införda.                                                                                                                                                   |
| Audit          | Ej påbörjad          | Audit-funktioner är inte införda.                                                                                                                                                    |
| Backups        | Ej påbörjad          | Backupfunktioner är inte införda.                                                                                                                                                    |
| Billing        | Ej påbörjad          | Billingfunktioner är inte införda.                                                                                                                                                   |

## Relaterade dokument

- [Control Center Roadmap](CONTROL_CENTER_ROADMAP.md)
- [Projektbeslut](PROJECT_DECISIONS.md)
- [Security Standard](SECURITY_STANDARD.md)
- [Databas- och migrationsflöde](DATABASE_WORKFLOW.md)
- [Tenant Database Design](TENANT_DATABASE_DESIGN.md)
