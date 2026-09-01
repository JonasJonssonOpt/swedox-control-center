# Installation Runtime Verification

## Status

## F2C9H final closure

| Fält                       | Resultat                         |
| -------------------------- | -------------------------------- |
| Tekniskt komplett          | Ja                               |
| Manuellt runtimeverifierat | Ja                               |
| Verksamhetsklart           | Ja                               |
| Låst/stängt                | Ja                               |
| Omfattning                 | F2C1–F2C9H avslutade             |
| Fixture cleanup            | Godkänd, 0 kvarvarande           |
| Slutregression             | 804/804 pgTAP, 158/158 Node-test |
| Security Pass              | GODKÄND                          |

### Slutlig kategorisk runtimeevidens

- Authentication/authorization: owner login, obligatorisk MFA/AAL2,
  owner-only access, reload samt logout/login är godkända.
- Create/detail/edit: create och redirect till detail, edit med
  revisionsökning, conflict rejection och stale save utan overwrite är
  godkända.
- Lifecycle: activate, pause, reactivate, decommission, archive och restore är
  godkända enligt den låsta state machine.
- Tenant availability: paused och archived tenant kan inte användas för ny
  installation; historisk installation förblir läsbar och mutation blockeras
  när tenant är otillgänglig.
- Audit: create-, edit- och lifecycle-event, newest-first, revisionskedja,
  immediate refresh utan F5, pagination över 25 och inga dubbletter är
  godkända.
- List: nullable metadata och `Saknas`, case/collation, sidstorlek 50,
  keyset-navigation, filter/search, cursorbevarande och cursorreset, inga
  dubbletter/hopp samt ingen crash/error boundary är godkända.

Vid browsertestet innehöll första sidan totalt 50 rader, varav 49 var fixtures
och en var en befintlig installation som matchade samma filterkontext. Detta är
korrekt: sidstorleken gäller hela resultsetet. Nästa sida visade återstående
matchande rader utan dubbletter eller hopp.

F2C9G seedade 55 syntetiska, tydligt avgränsade pagination-fixtures efter den
smala korrigeringen från felaktiga `owner.user_id` till schemats
`owner.owner_user_id`. Browserkontrollen passerade. Cleanup kördes därefter och
en separat read-only dry-run rapporterade kategoriskt `Would clean: 0` för den
55 rader stora allowlisten. Inga credentials, project refs eller fullständiga
UUID:n dokumenterades.

### Slutlig automatiserad regression

| Kontroll                 | Resultat   |
| ------------------------ | ---------- |
| Ren databasreset         | Godkänd    |
| Samtliga migrationer     | Godkänd    |
| Databaslint              | Godkänd    |
| pgTAP                    | 804/804    |
| Node-kontraktstest       | 158/158    |
| TypeScript               | Godkänd    |
| Prettier                 | Godkänd    |
| ESLint                   | Godkänd    |
| Next.js production build | Godkänd    |
| Routeinventering         | Godkänd    |
| `git diff --check`       | Godkänd    |
| `next-env.d.ts`          | Återställd |
| Lokal Supabase           | Stoppad    |

Följande avsnitt bevarar den kronologiska evidensen från tidigare F2C9-steg;
eventuella då öppna gates där är ersatta av F2C9H-resultatet ovan.

### F2C9F listpagination och slutlig modulgate

F2C9F:s automatiserade slutregression passerar lokalt med 804/804 pgTAP och
152/152 Node-test samt godkänd databaslint, TypeScript, Prettier, ESLint,
production build, routeinventering och `git diff --check`. Den låsta
listimplementationen är fortsatt keyset-baserad med sidstorlek 50,
`display_name COLLATE "C" ASC, id ASC`, komplett display name/UUID-cursor,
`limit + 1`, filterbunden cursor och literal search endast i display name och
installation code.

Den obligatoriska verkliga browserverifieringen över minst 51 säkra,
filtermatchande testinstallationer kunde inte utföras från denna arbetsmiljö:
den saknar en autentiserad owner/AAL2-browsersession och ett godkänt remote
testdataharness. Inga remote data skapades eller ändrades. Listpagination,
filter/search över flera runtime-sidor och efterföljande cleanup är därför
fortsatt öppna gates. Installation Management får inte markeras verksamhetsklar
eller stängd förrän dessa kontroller har dokumenterats som godkända.

### F2C9G tillfälliga pagination-fixtures

Den återstående browsergaten använder ett manuellt operatörsverktyg under
`scripts/runtime-tests/`, inte en produktfunktion. Verktyget kan skapa exakt 55
syntetiska, planned installationer i environment `test` med koderna
`pagination-fixture-001`–`pagination-fixture-055`, matchande display names och
null teknisk metadata. En explicit, aktiv och oarkiverad intern testtenant krävs.

Seed och cleanup kräver explicit cloud-test-target, tenant-ID, bekräftelse,
förväntad project ref och standardiserade `PG*`-credentials. Kör alltid
`--dry-run` först. Fixtures skapas genom en privilegierad operatörsanslutning
utan simulerad owner/auth-context och har därför avsiktligt ingen audit; de får
endast användas för listpagination. Seed kompletterar en validerad fixturemängd
upp till 55. Cleanup raderar endast den exakta tenantbundna allowlisten och
vägrar om någon fixture har ändrats eller fått audit. I det läget ska raderna
inte tvångsraderas utan hanteras i ett separat granskat cleanupsteg.

Efter seed verifieras sida 1 med 50 poster, `Nästa sida`, återstående poster på
sida 2, inga dubbletter eller hopp, bevarade filter/search-parametrar, cursor i
URL, cursorreset vid filterändring, `Saknas` för null host/region och frånvaro av
case-/Unicode-crash. Efter godkänd kontroll körs strikt cleanup och därefter kan
F2C9H dokumentera och stänga modulen.

Den första verkliga seed-körningen stoppades säkert före commit eftersom
write-pathen refererade till den obefintliga ownerkolumnen `user_id`. Dry-run
utelämnar installationens insert-select och kunde därför korrekt verifiera
target, tenant och fixtureplan utan att träffa kolumnfelet. En lokal
rollback-diagnos bekräftade PostgreSQL-felet; scriptet använder nu det faktiska
schemakontraktet `owner_user_id`. Ingen remote seed kördes av Codex efter fixen.

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

### F2C9D immediate audit rendering

Runtime visade att en lyckad pause skrev korrekt installation och audit
atomiskt, men att den nya auditposten kunde kräva F5 trots att status och
revision redan var färska. Rotorsaken var lokal Client Component-state från den
föregående revisionssnapshoten, inte databasen, RPC:n, service-read eller
Next.js route cache.

F2C9D återmonterar audit history på den synliga, icke-känsliga
installationsrevisionen. Den nya serverrenderingen laddar åter första auditsidan
direkt via public service; inga råa identifierare eller fabricerade auditposter
visas. Manuell app-runtime för edit, två lifecyclemutationer, newest-first,
inga dubbletter och utan F5 återstår före godkännande.

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
