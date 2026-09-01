# Modulstatus

## Syfte

Tabellen ger en gemensam överblick över Control Centers moduler. Status uppdateras först när en verifierbar förändring har genomförts och dokumenterats.

| Modul          | Status                 | Kommentar                                                                                                                                                                                                                                                                                                                           |
| -------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation     | Tekniskt komplett      | F2A:s permanenta shell, modulordning, aktiva textnavigation och rootredirect till `/tenants` är implementerade och lokalverifierade utan placeholder-routes.                                                                                                                                                                        |
| Authentication | Tekniskt implementerad | Ownerlogin, serverhanterade sessioner, TOTP-enrollment/challenge och AAL2-guard är implementerade och kontraktstestade. Full operativ mobil TOTP-verifiering återstår som releasegate.                                                                                                                                              |
| Authorization  | Tekniskt implementerad | Singleton-owner, environment/DB-integritet, ownerguard, RLS/FORCE RLS och funktionsgrants är implementerade och lokalverifierade. Operativ end-to-end-verifiering för release återstår.                                                                                                                                             |
| Customers      | Tekniskt komplett      | Tenant Management är end-to-end-verifierat och använder F2A:s gemensamma applikationsram utan duplicerad global navigation.                                                                                                                                                                                                         |
| Installations  | Verksamhetsklar · låst | Tekniskt komplett, manuellt runtimeverifierat och verksamhetsklart. F2C1–F2C9H är avslutade med owner/AAL2, CRUD, lifecycle, concurrency, tenant availability, audit- och listpagination, cleanup och slutregression 804/804 pgTAP samt 158/158 Node. Modulen är stängd; framtida ändringar kräver ett nytt analyserat change-step. |
| Licenses       | Ej påbörjad            | Licenshantering är inte införd.                                                                                                                                                                                                                                                                                                     |
| Versions       | Ej påbörjad            | Versionshantering är inte införd.                                                                                                                                                                                                                                                                                                   |
| Operations     | Ej påbörjad            | Driftfunktioner är inte införda.                                                                                                                                                                                                                                                                                                    |
| Support        | Ej påbörjad            | Supportfunktioner är inte införda.                                                                                                                                                                                                                                                                                                  |
| Health         | Ej påbörjad            | Health-funktioner är inte införda.                                                                                                                                                                                                                                                                                                  |
| Audit          | Delvis implementerad   | Append-only schema, atomisk mutationsintegration, paginerad ownerkontrollerad läsning och metadata-only tenant history UI är lokalverifierade. Retention och operativ export/backup återstår.                                                                                                                                       |
| Backups        | Ej påbörjad            | Backupfunktioner är inte införda.                                                                                                                                                                                                                                                                                                   |
| Billing        | Ej påbörjad            | Billingfunktioner är inte införda.                                                                                                                                                                                                                                                                                                  |

## F2C9D-status

F2C9D registrerar runtimeproblemet där lifecycle-audit tidigare kunde kräva F5.
Den lokala fixen och kontraktsverifieringen återställer audit history vid ny
installationsrevision. Fixen markeras slutligt verifierad först efter appdeploy
och godkänd manuell edit/lifecycle-körning utan F5. Därefter återupptas F2C9;
Installation Management är fortsatt öppen och inte formellt stängd.

## F2C9F-status

Slutlig lokal regression är grön med 804/804 pgTAP och 152/152 Node-test samt
övriga statiska/build-gates. Verklig listpagination med fler än 50 säkra
testinstallationer, filter/search över flera sidor och cleanup saknar ännu
godkänd browser-runtimeevidens. Modulen förblir därför tekniskt implementerad
men inte verksamhetsklar, låst eller stängd.

## F2C9G-status

Ett lokalt, operatörskontrollerat fixtureverktyg för exakt 55 syntetiska
testinstallationer är implementerat och kontraktstestat. Listpaginationens
runtimegate väntar på operatörens dry-run, seed, browserverifiering och strikta
cleanup. Modulen stängs först i F2C9H efter dokumenterat godkänt browserresultat.

## F2C9H-slutstatus

- Tekniskt komplett: Ja.
- Manuellt runtimeverifierat: Ja.
- Verksamhetsklart: Ja.
- Låst/stängt: Ja.
- F2C1–F2C9H: Avslutade.

Den verkliga listpaginationen passerade med fler än 50 matchande rader,
filter/search och utan dubbletter, hopp eller error boundary. Fixture-cleanup
verifierades read-only med kategoriskt noll kvarvarande rader. Full
slutregression passerade med 804/804 pgTAP och 158/158 Node-test.

## Relaterade dokument

- [Control Center Roadmap](CONTROL_CENTER_ROADMAP.md)
- [Projektbeslut](PROJECT_DECISIONS.md)
- [Security Standard](SECURITY_STANDARD.md)
- [Databas- och migrationsflöde](DATABASE_WORKFLOW.md)
- [Tenant Database Design](TENANT_DATABASE_DESIGN.md)
- [Installation Database Design](INSTALLATION_DATABASE_DESIGN.md)
