# Modulstatus

## Syfte

Tabellen ger en gemensam överblick över Control Centers moduler. Status uppdateras först när en verifierbar förändring har genomförts och dokumenterats.

| Modul          | Status                                       | Kommentar                                                                                                                                                                                                            |
| -------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation     | Tekniskt komplett                            | F2A:s permanenta shell, modulordning, aktiva textnavigation och rootredirect till `/tenants` är implementerade och lokalverifierade utan placeholder-routes.                                                         |
| Authentication | Ej påbörjad                                  | Version 1 är beslutad: ett `owner`-konto, e-post/lösenord och obligatorisk TOTP-MFA. Ingen autentisering är införd.                                                                                                  |
| Authorization  | Ej påbörjad                                  | Endast aktiv `owner`-behörighet ingår i version 1. Ingen auktorisering är införd.                                                                                                                                    |
| Customers      | Tekniskt komplett                            | Tenant Management är end-to-end-verifierat och använder F2A:s gemensamma applikationsram utan duplicerad global navigation.                                                                                          |
| Installations  | Read routes och mutation actions verifierade | F2C1–F2C7B:s databasgrund, server-only DAL/service, tre dynamiska GET-routes och sju separata mutation Server Actions är lokalverifierade. Formulär och UI saknas; Installation Management är inte verksamhetsklart. |
| Licenses       | Ej påbörjad                                  | Licenshantering är inte införd.                                                                                                                                                                                      |
| Versions       | Ej påbörjad                                  | Versionshantering är inte införd.                                                                                                                                                                                    |
| Operations     | Ej påbörjad                                  | Driftfunktioner är inte införda.                                                                                                                                                                                     |
| Support        | Ej påbörjad                                  | Supportfunktioner är inte införda.                                                                                                                                                                                   |
| Health         | Ej påbörjad                                  | Health-funktioner är inte införda.                                                                                                                                                                                   |
| Audit          | Delvis implementerad                         | Append-only schema, atomisk mutationsintegration, paginerad ownerkontrollerad läsning och metadata-only tenant history UI är lokalverifierade. Retention och operativ export/backup återstår.                        |
| Backups        | Ej påbörjad                                  | Backupfunktioner är inte införda.                                                                                                                                                                                    |
| Billing        | Ej påbörjad                                  | Billingfunktioner är inte införda.                                                                                                                                                                                   |

## Relaterade dokument

- [Control Center Roadmap](CONTROL_CENTER_ROADMAP.md)
- [Projektbeslut](PROJECT_DECISIONS.md)
- [Security Standard](SECURITY_STANDARD.md)
- [Databas- och migrationsflöde](DATABASE_WORKFLOW.md)
- [Tenant Database Design](TENANT_DATABASE_DESIGN.md)
- [Installation Database Design](INSTALLATION_DATABASE_DESIGN.md)
