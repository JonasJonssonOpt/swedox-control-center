# Installation Runtime Verification

## Status

| Fält           | Resultat                                           |
| -------------- | -------------------------------------------------- |
| Datum          | 2026-07-29                                         |
| Miljö          | Lokal verifiering och efterföljande länkad runtime |
| Beslut         | F2C9C väntar deployment och fortsatt runtime       |
| Modulstängning | Inte godkänd                                       |

## Ursprunglig lokal förutsättningskontroll

| Kontroll                                              | Resultat          |
| ----------------------------------------------------- | ----------------- |
| Lokal Supabase kan startas                            | Godkänd           |
| Rätt lokal projektcontainer kan identifieras entydigt | Godkänd           |
| Owner environment är konfigurerad i lokal miljö       | Godkänd           |
| Matchande Supabase Auth-user finns                    | Underkänd: saknas |
| Owner-singleton är bootstrappad                       | Underkänd: saknas |
| Owner login kan genomföras                            | Inte körd         |
| TOTP och AAL2 kan verifieras                          | Inte körd         |
| Browserbaserad Installation Management-runtime        | Inte körd         |

Inga fullständiga UUID:n, credentials, tokens, e-postadresser eller andra
identifierare registrerades i verifieringsresultatet.

## Ej körda områden i den ursprungliga lokala körningen

Create, edit, conflict, lifecycle, tenant availability, listfilter,
listpagination, audit history, auditpagination, session/reload, felvyer,
tillgänglighet och databasslutresultat kördes inte. Dessa områden kräver först
en godkänd Auth-user, owner-bootstrap och verifierad AAL2-session.

Ingen testtenant, testinstallation eller auditpost skapades. Därför behövdes
ingen datacleanup.

## Ursprunglig lokal blockerare

Owner-bootstrap får enligt det låsta kontraktet endast koppla en redan
verifierad Supabase Auth-user till owner-singletonen. Den får inte skapa en
Auth-user och F2C9 får inte ändra owner-, MFA- eller bootstrapmodellen.

En godkänd operatör behöver därför:

1. Skapa och identitetsverifiera en lokal Auth-user genom godkänd
   Auth-administration.
2. Säkerställa att lokal owner-environment pekar på samma user.
3. Köra och verifiera owner-bootstrap enligt `OWNER_BOOTSTRAP.md`.
4. Registrera och verifiera TOTP så att sessionen når AAL2.
5. Köra om hela F2C9 från början.

Installation Management förblir tekniskt komplett men öppet och inte
verksamhetsklart tills samtliga obligatoriska runtimeområden har passerat.

## Efterföljande runtimefynd

En separat runtimeverifiering mot det länkade molnprojektet nådde create och
identifierade därefter att administrativ aktivering felaktigt krävde komplett
provisioningmetadata. F2C9A korrigerade kontraktet med en framåtriktad
migration. Migrationen distribuerades och F2C9 återupptogs från
aktiveringssteget.

Efter F2C9A skapades en giltig installation utan teknisk metadata. När listan
laddades slog runtimevalideringen felaktigt ut hela sidan trots att
`application_host = null` och `hosting_region = null` följer domän- och
RPC-kontraktet. F2C9B låste nullable list-DTO, fail-closed validering och
presentationen `Saknas` utan att dokumentera fullständiga UUID:n eller faktisk
teknisk metadata. Appkoden distribuerades och verifieringen återupptogs.

F2C9B löste nullabilitykontraktet men listan kraschade fortsatt när databasen
returnerade case-varierade visningsnamn enligt sin collation och mappern
validerade med JavaScripts kodvärdesjämförelse. F2C9C ersätter den implicita
ordningen med PostgreSQL `COLLATE "C"` och identisk UTF-8-bytejämförelse i
serverkoden. Cursorparet förblir display name/UUID; äldre URL-cursors kan
behöva kastas och listan laddas om från början efter deployment.

Efter deployment ska listan, nullable metadata, samtliga filter, nästa sida och
frånvaro av error boundary verifieras innan F2C9:s conflict-test återupptas.

## Lokal verifiering av korrigeringarna

F2C9A–C har verifierats tillsammans från en ren lokal databas. Resultatet är:

| Kontroll                  | Resultat |
| ------------------------- | -------- |
| Samtliga migrationer      | Godkänd  |
| Databaslint               | Godkänd  |
| pgTAP                     | 804/804  |
| Node-kontraktstest        | 151/151  |
| TypeScript                | Godkänd  |
| Prettier                  | Godkänd  |
| ESLint                    | Godkänd  |
| Next.js production build  | Godkänd  |
| Routeinventering          | Godkänd  |
| Remote migrations-dry-run | Godkänd  |

Dry-runen distribuerade ingenting och visade endast
`20260729200000_stabilize_installation_list_collation.sql` som väntande.
