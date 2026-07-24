# Databas- och migrationsflöde

## Syfte

Detta dokument definierar repositoryts standard för utveckling och verifiering av Control Centers Supabase-databas. En lokal, tom migrationsmiljö är verifierad. Inget verksamhetsschema finns ännu.

## Verktyg och förutsättningar

- Node.js 24 enligt `package.json`
- npm 11 och `package-lock.json`
- Docker Desktop eller annan kompatibel Docker-daemon
- Supabase CLI `2.109.1`, exakt versionspinnad som lokal devDependency

CLI installeras reproducerbart med `npm ci` och körs genom repositoryts npm-scripts. Ett ospecificerat globalt CLI eller flytande `latest` är inte en del av workflowet.

## Schemakälla

Versionshanterade migrationsfiler under `supabase/migrations/` ska vara den auktoritativa schemakällan. Databasändringar får inte göras direkt i en delad miljö utan en granskad migration.

Repositoryt använder följande struktur:

```text
supabase/
  migrations/
  tests/
    database/
```

`supabase/config.toml` är genererad med den pinnade CLI-versionen och versionshanteras. Den innehåller endast lokal konfiguration. Migrationskatalogen innehåller ännu ingen SQL.

## Verifierade lokala scripts

| Script                     | Funktion                                                          |
| -------------------------- | ----------------------------------------------------------------- |
| `npm run supabase:version` | visar den versionspinnade lokala CLI-versionen                    |
| `npm run supabase:start`   | startar endast lokal stack och filtrerar credentialoutput         |
| `npm run supabase:stop`    | stoppar endast repositoryts lokala stack                          |
| `npm run supabase:status`  | verifierar lokal hälsa utan att skriva credentials                |
| `npm run supabase:reset`   | bygger om lokal databas från migrationerna med explicit `--local` |
| `npm run supabase:lint`    | lintar endast lokalt `public`-schema                              |
| `npm run supabase:test`    | kör lokala pgTAP-tester under `supabase/tests/database/`          |
| `npm run supabase:types`   | genererar TypeScript-typer från lokalt `public`-schema            |

Inget script länkar ett projekt eller använder `db push`, `db pull`, `db dump` eller `--linked`.

## Migrationer

Varje migration ska:

- ha ett UTC-baserat tidsstämplat namn och en kort beskrivning i `snake_case`
- behandla ett avgränsat schema- eller säkerhetsändamål
- granskas som vanlig källkod
- kunna appliceras som del av hela kedjan från en tom lokal testdatabas
- testas innan den får distribueras
- vara oföränderlig efter att den har distribuerats till en delad miljö

Fel i en distribuerad migration rättas med en ny framåtriktad migration. Destruktiva rollbackkommandon är inte en normalprocedur. Återställning av delad miljö följer den separata recoveryrunbooken.

## Lokal och länkad databas

Lokala och länkade kommandon har olika riskprofil och ska alltid behandlas som separata arbetsflöden.

- Lokal utveckling ska använda en isolerad lokal Supabase-stack och syntetiska data.
- Kommandots target ska anges eller verifieras uttryckligen.
- Länkning till ett externt projekt får endast ske i ett separat godkänt steg.
- Remote push, pull, dump, reset och seed får inte ingå i vanlig lokal verifiering.
- Destruktiva länkade kommandon får aldrig användas som rutin för staging eller produktion.
- En operatör ska verifiera projekt och environment före varje godkänd remoteoperation.

Repositoryt är inte länkat till ett externt Supabase-projekt. Login, link och alla remote databasoperationer kräver ett separat godkännande och ingår inte i normal lokal utveckling.

Den lokala CLI-stacken publicerar Dockerportar på värdmaskinen. Den får därför endast köras på en betrodd utvecklingsmaskin med aktivt brandväggsskydd och ska stoppas när den inte används. Standardstackens nätverksbeteende får inte beskrivas som produktionssäkert.

## Lokal konfiguration

Verifierade standardportar:

- API: `54321`
- databas: `54322`
- Studio: `54323`
- Mailpit: `54324`
- shadow-databas: `54320`

Lokalt gäller:

- signup och e-postsignup är avstängda
- anonymous sign-in och manual linking är avstängda
- externa providers är avstängda
- TOTP enrollment och verification är aktiverade
- seed är avstängd
- migrationskatalogen är aktiverad
- `public` och `graphql_public` exponeras av det lokala API:t
- analytics och vector exkluderas av det loggsäkra startscriptet på Windows

`project_id` i `config.toml` identifierar endast den lokala stacken. Det är inte en remote project reference. Den konfigurerade Postgres-huvudversionen är lokal; motsvarande remote version måste verifieras innan en framtida remote migrationsdeployment.

## Testdata

Lokal och automatiserad testning får endast använda syntetiska identiteter och syntetisk verksamhetsdata.

Följande får aldrig införas i seed, testfixtures eller Git:

- verkliga owner-UUID:n
- verkliga kund- eller kontaktuppgifter
- produktionscredentials
- tokens, nycklar eller anslutningssträngar
- kopior av kundernas verksamhetsdata

Seed är separat från schema och bootstrap. Seed får inte etablera owner i en delad miljö.

## Databastyper

Genererade TypeScript-typer:

- genereras från en lokal databas som byggts från de versionshanterade migrationerna
- sparas i `lib/supabase/database.types.ts`
- regenereras efter varje schemaändring
- verifieras i CI mot den committade versionen

Den tomma `public`-typen versionshanteras som baslinje eftersom den verifierar att workflowet fungerar och ger en deterministisk typdriftkontroll. Typer får inte genereras från ett oidentifierat eller oinventerat externt projekt.

## CI-standard

CI verifierar:

1. den pinnade CLI-versionen
2. start och status för lokal stack
3. att migrationskedjan kan appliceras från en tom databas
4. databaslint
5. det infrastrukturella pgTAP-smoketestet
6. att genererade databastyper inte har drift
7. befintlig formatkontroll, lint, typecheck och build
8. cleanup med lokal stop även om ett tidigare steg misslyckas

När tenant- och ownermigrationerna finns ska CI dessutom verifiera:

1. en upprepad lokal återställning
2. databas- och schemalint
3. negativa och positiva RLS-tester
4. att anonymous och fel authenticated user nekas
5. owner mismatch och fail-closed-beteende
6. att inga förbjudna secrets eller miljöspecifika owner-ID:n finns i migrationer

Remote deployment är en separat releaseprocess och ska inte ske från en vanlig pull request-kontroll.

## Verifierat i Steg B

- CLI `2.109.1` körs från lokal devDependency.
- Lokal stack kan startas, statuskontrolleras, stoppas och startas igen.
- Två efterföljande lokala resets lyckades med tom migrationskatalog.
- `public` innehåller inga SweDox-tabeller, views eller funktioner.
- Databaslint rapporterade inga schemafel.
- Ett syntetiskt pgTAP-smoketest passerade.
- Tomma TypeScript-databastyper genererades från lokal databas.

Kända begränsningar:

- Ingen tenant-, owner-, RLS- eller auditmigration finns.
- Ingen remote link finns och ingen remote migrationsväg är verifierad.
- RLS- och ownertester kan införas först när motsvarande schema finns.
- Postgres-huvudversionen i det externa projektet är ännu inte verifierad mot lokal config.

## Owner-bootstrap

Generella migrationer får skapa den framtida singletonens struktur men får aldrig innehålla ett verkligt owner-UUID. Ownerkonfiguration etableras genom en separat miljöspecifik, auditerad driftoperation enligt [Owner-bootstrap](OWNER_BOOTSTRAP.md).

## Recovery

Backup, restore, ownerbyte, migrationsavvikelse och RLS-fel hanteras enligt [Databas-recovery](DATABASE_RECOVERY.md). Tenant Management ska vara stängt fail-closed tills recovery har verifierats.

## Känslig lokal state

Följande ska hållas utanför Git:

- `.env*`, med endast uttryckliga exempelundantag
- Supabase CLI:s `.temp/` och `.branches/`
- lokala dump- och backupfiler
- alla credentials och miljöspecifika identifierare

`supabase/config.toml` får senare versionshanteras endast om den saknar secrets. Känsliga värden ska refereras från en godkänd miljö- eller secrethantering.
