# F2D3: Licensing Owner Read / Security med DB-AAL2

Datum: 2026-09-12. Kodbaseline före steget: `8f05d13`.
Den styrande 1.0-roadmapen och dess dokumentationslänkar fanns redan som
ocommittade ändringar och har bevarats.

## Analys och avgränsning

F2D2:s tre tabeller och constraints finns. Det låsta kontraktet i
LICENSE_DATABASE_DESIGN kräver authenticated owner+AAL2 SELECT på `licenses`
och `license_terms_versions`, medan audit ska läsas genom en senare separat
RPC. Shared `is_control_center_owner()` är SECURITY DEFINER och verifierar
singleton-identiteten utan MFA. Den återanvänds oförändrad. Appens SSR-session,
verifierade claims, aktuella MFA-kontroll och environment/DB-integritet består.

Planen genomfördes som en atomisk migration, en fokuserad säkerhetstestfil,
uppdaterade F2D2-accessförväntningar och en genererad funktionssignatur.
Inga foundationconstraints eller Owner-/Tenant-/Installation-kontrakt ändrades.

## Helper och policies

`public.is_licensing_owner_aal2()` är argumentlös och returnerar boolean.
Den kräver `auth.uid() IS NOT NULL`, befintlig ownerhelper och JSONB-likhet
mellan top-level `auth.jwt() -> 'aal'` och JSON-strängen `"aal2"`.
Detta accepterar inte metadata, AMR, array, objekt, nummer, boolean eller
annan sträng. NULL normaliseras till false. Endast
`invalid_text_representation` fångas för felaktig request-JSON/UUID; övriga
operativa fel döljs inte och ger ingen åtkomst.

Funktionen är PL/pgSQL, SECURITY INVOKER, STABLE, PARALLEL UNSAFE, ägs av
`postgres` och har `search_path = pg_catalog`. Auth- och ownerfunktionerna
är schemakvalificerade. Endast `authenticated` har EXECUTE bland API-rollerna;
PUBLIC, anon och service_role saknar det, även effektivt via ACL.
Invoker räcker eftersom authenticated redan får köra den befintliga ownerhelpern.

Exakt två policies införs: `licenses_owner_aal2_select` och
`license_terms_versions_owner_aal2_select`, båda SELECT för authenticated med
enbart `is_licensing_owner_aal2()` som villkor. Alla tre tabeller behåller
RLS/FORCE RLS. Läsning är oberoende av tenantstatus, licensstatus och giltighet.

## Verifierad accessmatris

| Roll/identitet och claim                             | Helper              | Licenses/terms SELECT                  |
| ---------------------------------------------------- | ------------------- | -------------------------------------- |
| authenticated owner + top-level sträng aal2          | true                | Alla fixture-rader, inklusive historik |
| owner + aal1, missing, null eller unknown            | false               | Noll rader                             |
| owner + fel JSON-typ, case eller whitespace          | false               | Noll rader                             |
| owner + aal2 endast i metadata, AMR eller annan path | false               | Noll rader                             |
| non-owner + aal1/aal2                                | false               | Noll rader                             |
| authenticated utan uid, felaktig UUID/JSON           | false               | Noll rader                             |
| saknad singleton eller owner-mismatch                | false               | Noll rader                             |
| anon eller service_role                              | EXECUTE nekas       | SELECT nekas med 42501                 |
| PUBLIC                                               | Ingen EXECUTE-grant | Ingen SELECT-grant                     |

Audit har noll policies och noll direkta grants, även för owner+AAL2.
Alla API-roller saknar INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN
på samtliga tre tabeller. Riktiga INSERT/UPDATE/DELETE/TRUNCATE-försök under
authenticated owner+AAL2 ger 42501. Det finns inga mutations- eller audit-RPC.

## JWT-modell och verifieringens gräns

Lokal CLI är 2.109.1 och Auth-image är `supabase/gotrue:v2.194.0`.
`pg_get_functiondef` verifierade den faktiskt installerade `auth.jwt()`:
den returnerar jsonb från `request.jwt.claim`, annars `request.jwt.claims`.
`auth.uid()` läser legacy subject-setting eller top-level `sub` i claims.
pgTAP tömmer legacy settings och använder syntetisk `request.jwt.claims` med
top-level `sub` och `aal`, under faktisk authenticated-roll. Detta följer
[Supabases JWT claims reference](https://supabase.com/docs/guides/auth/jwt-fields),
där `aal` är en sträng med värdena aal1/aal2. Ingen claimformatavvikelse hittades.

Ett kompletterande försök att kontrollera Auth-utfärdade tokens lokalt stoppades
vid login med `email_provider_disabled`. Auth-konfigurationen ändrades inte;
de tillfälliga lokala Auth-användarna raderades och noll kvarvarande användare
verifierades. Inga tokens eller TOTP-secrets loggades.

DB-definition, dokumenterat claimformat och syntetisk DB-access är verifierade.
Signerad AAL1/AAL2 Data API-runtime, signaturfel, tokenstaleness, mobil MFA och
cloud är inte verifierade av detta steg och kvarstår i F2D9/F2H. DB-predikatet
verifierar inte JWT-signaturen självt och ersätter inte aktuell appguard.

## Full lokal regression

| Kontroll                                                      | Resultat                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| Lokal start och clean reset av hela migrationskedjan          | Godkända                                                   |
| Databaslint                                                   | Inga schemafel                                             |
| Alla pgTAP                                                    | 1 323/1 323, 21 filer                                      |
| Ny F2D3-fil                                                   | 235/235                                                    |
| Node/contract med `--import ./tests/register-server-only.mjs` | 162/162                                                    |
| TypeScript och ESLint                                         | Godkända                                                   |
| Next production build                                         | Godkänd; befintliga routes, inga licensroutes              |
| Upprepad lokal typgenerering                                  | Byteidentisk; enda avsiktliga typdiff är helperns signatur |

F2D2-accessfilens gamla noll-SELECT/noll-helper-förväntningar har anpassats till
det nya läskontraktet. Samtliga foundationconstraints och stängda domäners
befintliga tester passerar. Två testskrivfel (pgTAP name/text-cast och SQL:s
set-returning-anrop) rättades före den fullständigt godkända körningen.
Byggets ändring av `next-env.d.ts` återställdes.

Slutlig Prettier-kontroll för hela repositoryt och `git diff --check`
passerade. Lokal Supabase-status verifierades och stacken stoppades efter
avslutade kontroller. Noll tillfälliga Auth-användare fanns kvar före stopp.

## Status och nästa steg

F2D3 är implementerat och lokalt verifierat. Licensing är inte komplett,
verksamhetsklart eller runtime/cloud-verifierat. F2D4 är nästa steg.
Mutationer, append-only-triggers, audit-read RPC, pagination, eligibility,
DAL/service, routes/actions och UI ingår inte. Ingen cloud SQL, deployment,
commit eller push genomfördes.
