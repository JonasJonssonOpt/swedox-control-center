# License Database Design

## Aktuell status: F2D5A, 2026-09-13

create_license är implementerad med owner+AAL2, DB-actor, tillgänglig Tenant,
Tenant FOR NO KEY UPDATE, canonical paket och en post-lock beslutstid.
Draft license/audit/terms skapas atomiskt under oförändrat F2D4-skydd.
F2D5 följer och preciserar F2D1B: alla terms changes kräver tillgänglig Tenant,
även nedgradering; endast suspend/terminate undantas. Datumkontraktet bevaras.
Se [F2D5A-verifieringen](LICENSE_MUTATION_VERIFICATION.md): 1 531 pgTAP,
162 Node och 5 concurrencykontroller passerar. Nästa steg är F2D5B.
F2D5B/C återstår och Licensing är inte komplett. Äldre statusavsnitt är historiska.

## Aktuell status: F2D4, 2026-09-13

Terms och audit är append-only för UPDATE/DELETE/TRUNCATE. Tre deferred
constraint triggers verifierar sammanhängande historik, aktuell termspekare
och terms/event-relation under parentlås. F2D3:s accessgräns är oförändrad.
Se [F2D4-verifieringen](LICENSE_HISTORY_INTEGRITY_VERIFICATION.md) för exakt
modell, adminundantag och 1 444 pgTAP, 162 Node samt 8 concurrencykontroller.
Licensing är inte komplett. Nästa steg är F2D5; statusavsnitten nedan är historiska.

## Aktuell status: F2D3, 2026-09-12

Owner+AAL2 SELECT på `licenses` och `license_terms_versions` är implementerad
och lokalt verifierad. Den argumentlösa `is_licensing_owner_aal2()` är SECURITY
INVOKER, STABLE, PARALLEL UNSAFE med `search_path = pg_catalog`; endast
authenticated har EXECUTE. Den kombinerar oförändrad ownerhelper med exakt
top-level JSON-sträng aal2. Audit förblir utan policies och direkta grants;
alla direkta writes är stängda. Inga produkt-RPC, DAL eller UI införs.

Full regression: 1 323 pgTAP och 162 Node-test, databaslint, TypeScript, ESLint
och production build godkända. Lokal typgenerering är deterministisk.
Se [F2D3-verifieringen](LICENSE_OWNER_AAL2_VERIFICATION.md) för accessmatris,
claimmodell och kvarstående signerad runtime/cloud-verifiering. Licensing är
inte komplett. Nästa steg är F2D4; F2D2/F2D1B nedan är historiska steg.

## Aktuell status: F2D2, 2026-09-12

Databasgrunden är implementerad i
`20260909064727_create_licensing_foundation.sql` med tre tabeller, constraints,
index, RLS/FORCE RLS och helt stängda appgrants. Fyra pgTAP-filer och
databastyper ingår. Lokal reset, databaslint och samtliga 1 088 pgTAP-test
passerar. Licensdelens genererade typer matchar repositoryt.

Global typjämförelse passerar efter en avgränsad korrigering av typgenereringen
för fem befintliga nullable RPC-fält. Se [verifieringsrapporten](LICENSE_FOUNDATION_VERIFICATION.md).
F2D2 är lokalt databasverifierad utan kvarstående typdrift.
Licensing som produkt är inte komplett eller runtimeverifierad; F2D3–F2D9
återstår. Ingen remoteoperation har genomförts i verifieringen.

F2D1B-avsnitten nedan beskriver det historiska analyssteget och det beslutade
kontraktet. Deras uppgifter om saknad implementation gäller före F2D2.

## F2D1B: status, beslut och avgränsning

Datum: 2026-09-09. F2D1B är ett analys-, beslutslås- och dokumentationssteg.
Domänbesluten kommer från projektägaren och ersätter F2D1:s öppna affärsfrågor.
Nedanstående är det låsta rekommenderade 1.0-kontraktet för implementationens
planering. Licensing är **analyserad och beslutad, ännu ej implementerad,
ännu ej runtimeverifierad**, inte tekniskt komplett eller verksamhetsklar.

Ingen migration, SQL-körning, tabell, RPC, policy, grant, service, route, action
eller UI skapas av detta steg. Tenant och Installation är oförändrade.
F2C1–F2C9H:s closure gäller; Licensing får inte bygga ut stängda domäner indirekt.

## Repository truth och återanvändning

| Underlag                                                                         | Klassificering          | Slutsats                                                                                   |
| -------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| `20260724193158_create_tenants.sql`, tenant types/service                        | KAN ÅTERANVÄNDAS        | UUID, active/paused och separat arkiv är publicerade kontrakt.                             |
| `20260728190000_create_installations.sql`, installation types/service            | KAN ÅTERANVÄNDAS        | Immutable tenantrelation, fyra environments och flera installationer per tenant.           |
| `20260729190000_decouple_installation_activation_from_provisioning_metadata.sql` | KAN ÅTERANVÄNDAS        | Administrativ aktivering kräver inte teknisk readiness.                                    |
| `20260727120000_enable_tenant_owner_read_access.sql`                             | KAN DELVIS ÅTERANVÄNDAS | Ownerhelper återanvänds oförändrad; Licensing kompletterar med egen AAL2-predikatkontroll. |
| `lib/server/auth/`, `lib/supabase/server.ts`                                     | KAN ÅTERANVÄNDAS        | Ownerintegritet, app-AAL2 och cookiebaserad requestlokal SSR.                              |
| Tenant-/Installation-repository, service, mapper, actions och read routes        | KAN DELVIS ÅTERANVÄNDAS | Arkitektur/felmönster, inte domänimplementation.                                           |
| `tenant_audit_events`, `installation_audit_events`, MFA-konsollogg               | SKA INTE ÅTERANVÄNDAS   | Licensing-händelser får en egen beständig auditdomän.                                      |
| Installation pgTAP och Node-kontraktstest                                        | KAN DELVIS ÅTERANVÄNDAS | Mönster för grants, concurrency, rollback, pagination och outputvalidering.                |
| `ControlCenterShell`, `StatusText`                                               | KAN ÅTERANVÄNDAS        | Global ram och textstatus; inga nya UI-komponenter nu.                                     |
| Licensing-/Subscription-/Package-tabeller, RPC, typer, service, usage och tester | SAKNAS                  | Ingen befintlig affärsimplementation kräver ytterligare modell.                            |
| Licenses/Provisioning i shell och navigationstest                                | KAN DELVIS ÅTERANVÄNDAS | Framtida modulpositioner, inga produktfunktioner.                                          |

Granskade dokument: MODULE_STATUS, CONTROL_CENTER_ROADMAP, Launch_1_0,
PROJECT_DECISIONS, SECURITY_STANDARD, UI_STANDARD, TENANT_DATABASE_DESIGN,
INSTALLATION_DATABASE_DESIGN, INSTALLATION_RUNTIME_VERIFICATION och CHANGELOG.
Separat Licensing-/Provisioning-design saknades före detta dokument.
Historiska dokumentavsnitt om saknade moduler eller äldre aktiveringskrav
ersätter inte senare migrationer och F2C9H:s slutstatus.
Tidigare 804/804 pgTAP och 158/158 Node är dokumenterad Installation-evidens,
inte ny Licensing-verifiering.

## Ägarskap, kapacitet och paket

License ägs av tenant. Tenant har högst en icke-terminerad licens, inklusive
draft, suspended och tidsmässigt expired. Terminerade licenser bevaras och
hindrar inte en ny licens för samma tenant. Tenantrelationen är immutable.

Samtliga installationer konsumerar samma tenantlicens. Kapacitet multipliceras
inte och reserveras inte per installation. Ingen installation_id på licensen,
ingen assignment-tabell och ingen environmentkvot i 1.0. Licens kan finnas före
första installation. Internal/pilot ger inget implicit undantag.

Kapacitet betyder beviljat maxantal **aktiverade användarkonton som kan logga
in i SweDox**. Personalposter, inaktiva konton, historiska personer, samtidiga
sessioner och antal miljöer ingår inte i måttet. Faktisk förbrukning, gemensam
kontoräkning och teknisk enforcement ägs av framtida konsument/integration.
Ingen usage-motor, användarlista eller usage-tabell införs i Licensing 1.0.
Eligibility bevisar därför inte att faktisk användning understiger gränsen.

| Plan key | Plan version | Label    | Affärsintervall | Beviljad standardmaxkapacitet |
| -------- | ------------ | -------- | --------------- | ----------------------------- |
| mini     | 1            | Mini     | 1–24            | 24                            |
| standard | 1            | Standard | 25–49           | 49                            |
| stor     | 1            | Stor     | 50–100          | 100                           |

För 1.0 används paketets övre gräns som max_active_users. Ingen separat
godtycklig seat override införs. De nedre intervallgränserna beskriver
paketindelning, inte tekniskt minimiantal: Standard spärras inte för 20 konton.
Planbyte byter hela godkända plan-snapshoten, inte bara etiketten.

Plan/package är en versionshanterad definition, License är beviljad rättighet.
Den lilla godkända katalogen versionshanteras med kommande implementation;
ingen DB-katalog eller katalogadmin-UI behövs. DB-mutationer ska validera
tillåtna plan/version/max/label-kombinationer, inte lita på klientens snapshot.
Historiska villkor ändras aldrig av nya definitioner. Nya planversioner kräver
ett explicit granskat ändringssteg; befintliga snapshotconstraints får inte
göra äldre versioner ogiltiga.

Alla befintliga SweDox-verksamhetsmoduler ingår i 1.0. Ingen modulmatris,
modulnyckellista eller entitlement-JSON lagras. Individuell licensiering av
Projekt, Tid, Planering, Leverantörsfakturor, Fakturor, Offerter, Kalkyl,
Dokument, Formulär, Kunder, Personal, Artiklar och Rapporter är borttagen ur 1.0.
Framtida differentiering kräver ett separat change-step.

Priserna 6 499 / 8 499 / 10 999 kr/mån och cirka 10 procent årsrabatt är
historisk kontext, inte tekniska licensvillkor.

## Lifecycle

| Lagrad status | Semantik                                                   | Tillåtna nästa statusar |
| ------------- | ---------------------------------------------------------- | ----------------------- |
| draft         | Registrerad, ännu inte beviljad; ger aldrig eligibility.   | active, terminated      |
| active        | Administrativt beviljad; teknisk giltighet bedöms separat. | suspended, terminated   |
| suspended     | Tillfälligt spärrad oavsett datum.                         | active, terminated      |
| terminated    | Permanent avslutad; kan endast läsas historiskt.           | Inga                    |

Alla andra transitions och upprepning av samma status nekas.
Activate från suspended återger endast administrativ rättighet och förlänger
inte datum. Activate kräver att slutet inte redan passerat, men tillåter
framtida valid_from (då är giltigheten not_started). En utgången licens kan
förnyas först och därefter aktiveras vid behov. Terminated kan aldrig förnyas,
redigeras eller återaktiveras: skapa ny licens.

Ingen transition ändrar tenant, installation, deployment eller körande SweDox.
Teknisk verkställighet hos konsumenten är ett separat integrationssteg.

## Giltighet och renewal

valid_from är obligatorisk finite timestamptz. valid_until är nullable finite
timestamptz; null betyder Tills vidare. PostgreSQL infinity används inte.
Satt slut måste vara strikt efter start. DB-tid är auktoritativ; en och samma
utvärdering använder ett enda tidsvärde. Klientklockan styr aldrig eligibility.

- not_started: t < valid_from.
- valid: valid_from <= t och (valid_until är null eller t < valid_until).
- expired: valid_until finns och t >= valid_until.

expired lagras aldrig som administrativ status. Ingen grace period, implicit
auto-renewal eller separat trial-status finns. Pilottenant är inte implicit trial.
Kommersiella avtalsdatum är inte tekniska giltighetsdatum.

Create väljer start vid DB:s aktuella beviljandetid eller uttrycklig framtida
tid; backdaterad start nekas. Drafts får byta hela villkorsmålbilden med samma
regel. Efter första aktivering är start immutable utom vid renewal efter utgång.
Planbyte i active/suspended bevarar datum; datumändringar går genom renewal.

Renew gäller active/suspended, ändrar inte administrativ status och skapar ny
villkorsversion med samma plan/kapacitet. För ett ännu inte utgånget ändligt
intervall bevaras start och slut flyttas framåt, alternativt till Tills vidare.
För redan utgånget intervall börjar den nya perioden vid DB:s nya beviljandetid
(t vid mutation efter låsning); nytt slut måste ligga senare eller vara null.
Historiska versioner bevarar avbrottet. Ingen backdatering eller schemalagd
framtida ersättningsperiod efter avbrott i 1.0. Renewal av Tills vidare nekas
som meningslös; förkortning av giltighet hanteras inte av renewal. Suspend eller
terminate används för indragning. Schemalagd uppsägning och framtida planbyten
är senare scope.

Villkorsversionernas intervall kan överlappa vid en tidig förlängning. De är
successiva beslutssnapshots, inte parallella rättigheter. Historisk bedömning
använder den version och administrativa status som gällde vid beslutstillfället,
aldrig dagens pointer projicerad bakåt.

## Tenant availability och transaktionsgräns

Create, activate, renew och alla terms changes (även paketnedgradering) kräver
active och icke-arkiverad tenant. Den konservativa regeln håller planbyte entydigt.
Suspend och terminate kräver inte tillgänglig tenant; en paused/archived tenant
får aldrig blockera dessa indragningar. Läsning av historik är alltid tillåten
för auktoriserad owner. Ingen tenantstatus skrivs av Licensing.

En sänkt gräns ändrar endast beviljad kapacitet. Ingen faktisk underförbrukning
påstås och inga konton avaktiveras. Konsumenten får senare hantera överförbrukning.

Availability ska läsas och skyddas i samma DB-transaktion som rättighetsökningen.
Vid kommande implementation används tenant-radlås som blockerar konkurrerande
status/archive-update (FOR SHARE, inte enbart FOR KEY SHARE), före license-radlås.
Tenantidentitet är immutable; alla Licensing-writes använder samma låsordning.
Suspend/terminate behöver bara licenslåset. Befintliga Tenant-funktioner ändras
inte. Publicerade tenantfält konsumeras för FK/integritetskontroll i Licensing-RPC;
applikationskod importerar aldrig Tenant-repository. Samtidiga tenantmutationer
måste testas för serialisering och frånvaro av deadlocks.

## Datamodell: exakt 1.0-snapshot

Tre tabeller i public föreslås för implementation. Inga ytterligare tekniska
entitlementfält behövs. Namngivning följer pk_, fk_, uq_, ck_ och idx_.

### licenses

| Fält                  | Typ         | Null/default           | Ansvar                                        |
| --------------------- | ----------- | ---------------------- | --------------------------------------------- |
| id                    | uuid        | NOT NULL, DB-genererad | PK; immutable                                 |
| tenant_id             | uuid        | NOT NULL               | FK tenants(id), ON DELETE RESTRICT; immutable |
| status                | text        | NOT NULL, draft        | Exakt lifecycle-allowlist                     |
| revision              | bigint      | NOT NULL, 1            | Positiv concurrencyrevision                   |
| current_terms_version | bigint      | NOT NULL, 1            | Aktuell villkorsversion för samma licens      |
| created_at            | timestamptz | NOT NULL, DB-tid       | Immutable                                     |
| created_by            | uuid        | NOT NULL               | auth.uid(), ingen Auth-FK                     |
| updated_at            | timestamptz | NOT NULL, DB-tid       | Senaste mutation                              |
| updated_by            | uuid        | NOT NULL               | auth.uid(), ingen Auth-FK                     |

Constraints: statusallowlist, revision > 0, current_terms_version > 0,
current_terms_version <= revision, finite tidsfält och updated_at >= created_at.
FK (id, current_terms_version) till license_terms_versions(license_id, version)
är DEFERRABLE INITIALLY DEFERRED med NO ACTION: referensen måste vara komplett
vid commit. Den cykliska relationen gör create atomiskt möjlig utan null-pointer.
Övriga historik-FK använder RESTRICT.

Index: PK, unik tenant_id där status <> terminated, tenant_id för all historik,
(created_at DESC, id DESC) för standardlista. Ingen datum-/status-/sökindexflora.
Den partiella unikheten räknar även draft, suspended och expired.
Ingen separat archivekolumn eller fysisk delete i 1.0; terminated döljs av filter.
Write path är endast de sex domänmutationerna nedan; varje success har en auditpost.

### license_terms_versions

| Fält                   | Typ         | Null/default | Ansvar                                      |
| ---------------------- | ----------- | ------------ | ------------------------------------------- |
| license_id             | uuid        | NOT NULL     | FK licenses(id), RESTRICT                   |
| version                | bigint      | NOT NULL     | Positiv, börjar 1, ökas +1 per terms change |
| introduced_at_revision | bigint      | NOT NULL     | Licensrevision som införde snapshoten       |
| plan_key               | text        | NOT NULL     | mini, standard, stor i version 1            |
| plan_version           | integer     | NOT NULL     | Positiv katalogversion, initialt 1          |
| plan_display_label     | text        | NOT NULL     | Mini, Standard, Stor enligt version         |
| max_active_users       | integer     | NOT NULL     | Positiv beviljad maxkapacitet               |
| valid_from             | timestamptz | NOT NULL     | Inkluderande start                          |
| valid_until            | timestamptz | NULL         | Exkluderande slut eller Tills vidare        |

PK (license_id, version); unik (license_id, introduced_at_revision).
Checks: positiva versioner, introduced_at_revision >= version, godkänd exakt
plan/version/label/max-kombination, finite datum och slut > start när satt.
Inga priser, modulmatriser, JSON, usage, notes eller installationfält.
Snapshotens actor/tid kommer från motsvarande auditrevision, inte duplicerade
fält. FK (license_id, introduced_at_revision) till auditens unika
(license_id, revision_after) valideras deferred vid commit med NO ACTION.
Create/terms_changed/renewed måste ha exakt en ny termsrad; andra event ingen.
Eventkoppling, sammanhängande version och pointerbyte verifieras i mutation och
deferred integritetskontroll vid commit; ingen oskyddad fristående termsinsert.

Samtliga rader är immutable och append-only; UPDATE/DELETE/TRUNCATE saknar
appgrants och UPDATE/DELETE blockeras även av skyddstrigger.
PK och unikhetsindex räcker för villkorshistorik och FK-prefixuppslag.
Ingen separat revision på en immutable termsrad; introduced_at_revision pekar
på licensens revisionskedja. Endast create/change terms/renew får införa version.

### license_audit_events

| Fält            | Typ         | Null/default           | Ansvar                                |
| --------------- | ----------- | ---------------------- | ------------------------------------- |
| id              | uuid        | NOT NULL, DB-genererad | PK                                    |
| license_id      | uuid        | NOT NULL               | FK licenses(id), RESTRICT             |
| event_type      | text        | NOT NULL               | Sex fasta event                       |
| actor_user_id   | uuid        | NOT NULL               | DB-bunden auth.uid(), ingen Auth-FK   |
| occurred_at     | timestamptz | NOT NULL, DB-tid       | Finite beslutstid                     |
| revision_before | bigint      | NULL endast create     | Föregående revision                   |
| revision_after  | bigint      | NOT NULL               | Ny revision                           |
| changed_fields  | text[]      | NOT NULL               | Icke-tom canonical fältnamnsallowlist |
| correlation_id  | uuid        | NULL tillåts i DB      | Servergenererad korrelation           |

Unik (license_id, revision_after). Create: before null, after 1.
Övriga: before > 0, after = before + 1. Events är exakt license_created,
license_terms_changed, license_activated, license_suspended, license_renewed,
license_terminated. Reaktivering använder license_activated.
Fältnamnsallowlist i denna ordning: id, tenant_id, status, revision,
current_terms_version, plan_key, plan_version, plan_display_label,
max_active_users, valid_from, valid_until, created_at, created_by, updated_at,
updated_by. Endimensionell array utan null, dubbletter eller okända namn.
Den innehåller endast ändrade fältnamn; inga gamla/nya värden eller snapshots.
Tenant härleds via immutable license-FK.

Index: PK, unik revision och (license_id, occurred_at DESC, id DESC).
Append-only skyddstrigger samt inga direkta API-grants/policies. Ingen fristående
auditinsert-RPC. Auditfailure rullar tillbaka hela mutationen.
Ingen fysisk delete, retentionpurge eller archive. Retention/export/backup kräver
senare operativ design, utan automatisk historikradering i 1.0.

## Mutationer, revision och historik

| Operation (framtida RPC-namn) | Tillstånd                                | Resultat                                                          |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| create_license                | Ingen icke-terminerad licens             | draft, revision 1, terms 1, license_created                       |
| change_license_terms          | draft/active/suspended                   | Ny godkänd snapshot, revision +1, terms +1, license_terms_changed |
| activate_license              | draft/suspended; ej expired              | active, revision +1, oförändrade terms, license_activated         |
| suspend_license               | active                                   | suspended, revision +1, oförändrade terms, license_suspended      |
| renew_license                 | active/suspended enligt giltighetsregler | revision +1, terms +1, license_renewed; status oförändrad         |
| terminate_license             | draft/active/suspended                   | terminated, revision +1, oförändrade terms, license_terminated    |

Alla utom create tar license_id och positiv expected_revision. Klienten väljer
godkänd plan key/version och tillåtna datum, aldrig actor, target status, revision
after, termsnummer eller auditfält. Samtliga RPC omprövar owner+AAL2 före uppslag.
Radlås och revision jämförs före state; stale => conflict, aldrig overwrite/retry.
Bigint får inte tyst förlora precision i TypeScript: output/input utanför säkert
heltalsintervall nekas av framtida DTO-validering.

Oförändrad termsmålbild ger validation_error utan revision/audit. Upprepad status
ger invalid_state_transition, också utan write. Create-kollision ger
duplicate_license. Övriga stabila fel: unauthorized, not_found, conflict,
validation_error, invalid_state_transition, tenant_not_available, audit_failure,
unexpected_error. Ingen rå DB-revision eller SQL-detalj i fel.

Licensrevision räknar alla lyckade mutationer; terms version räknar bara nya
villkorssnapshots. Båda är sammanhängande från 1 men behöver inte vara lika.
License, nya terms där relevant och exakt en auditpost committas atomiskt.
Licensens aktuella revision ska motsvara senaste auditrevision vid commit.
DB skapar actor/tider; action skapar correlation-ID. Audit och villkor bevarar
historiken även efter nytt licensobjekt för samma tenant.

## AAL2: fokuserad säkerhetsanalys och beslut

### 1. Var verkställs AAL2 idag?

get-verified-claims.ts anropar supabase.auth.getClaims() och allowlistar aal1/aal2.
get-owner-authorization.ts jämför verifierade claims, getUser och environment.
get-owner-mfa-state.ts kräver claims aal2, currentLevel aal2, nextLevel aal2 och
exakt en stödd TOTP-factor. requireFullAccessOwner() godkänner först därefter.
requireOwnerIntegrity() återanvänder detta genom getOwnerIntegrity och jämför
environment/Auth/DB. Tenant-/Installation-service anropar guarden före repository.
Supabase SSR använder cookiebunden användarsession och publishable key.

### 2. Kan owner på AAL1 anropa befintliga RPC direkt?

Ja, enligt migrationskontraktet: authenticated har EXECUTE och owner-RPC kontrollerar
auth.uid() mot singleton via is_control_center_owner(), utan aal/AMR-kontroll.
Samma sak gäller befintlig owner-SELECT-policy. En giltig AAL1-owner-token nekas
inte av dessa DB-predikat, även om övriga domänpreconditions fortfarande gäller.
Next.js kan kringgås genom Data API; public är exponerat i supabase/config.toml.
Detta är en kodbaserad slutsats, inte ett nykört remote exploittest.

### 3. Är gränsen redan dokumenterad/accepterad?

Ja som etablerat arkitekturval: PROJECT_DECISIONS lägger AAL2/equality i appen,
och SECURITY_STANDARD säger uttryckligen att DB-kontrollen inte bevisar AAL2.
F2C9H har godkänt Installation med denna fördelning. Däremot finns inget separat
bevis för att direkt AAL1-åtkomst försvinner när serverguarden kopplas in.
Den äldre formuleringen om kvarvarande risk tills appgränsen kopplas får inte
tolkas så; Data API-gränsen består. F2D1B återöppnar eller ändrar inte dessa domäner.

### 4. Finns en lokal Licensing-lösning?

Ja. Rekommendation **B: Licensing-specifik DB-AAL2 enforcement**, utöver oförändrad
appguard. Varje Licensing-SELECT-policy kräver BÅDE oförändrad ownerhelper och
att top-level auth.jwt()-claimen aal är exakt strängen aal2. Varje Licensing-RPC
(read, audit, terms history, summary, eligibility och mutation) kontrollerar samma
predikat explicit, även SECURITY DEFINER som inte kan förlita sig på tabell-RLS.
Null/saknad/okänd/feltypad claim nekar. Ingen ändring av gemensam helper.
Ingen fristående permissiv AAL2-policy som skulle OR-kombineras med ownerpolicy.

### 5. Är claimen tillförlitlig och tillgänglig?

Supabase dokumenterar top-level aal och användning av auth.jwt() i RLS.
AMR beskriver autentiseringsmetoder; ingen egen AMR-tolkning behövs för AAL2.
Vi inför ingen påhittad PostgreSQL get_claims()-funktion: repositoryt använder
JS getClaims(), medan DB läser requestens claims via auth.jwt().
Källa: [JWT claims reference](https://supabase.com/docs/guides/auth/jwt-fields).

Förtroendet kommer från Data API:s verifiering av signerad token innan DB-roll/
requestclaims sätts, inte från JSON-extraktionen i auth.jwt(). En klientparameter
eller user_metadata som säger aal2 är aldrig bevis. Direkt privilegierad SQL kan
simulera requestclaims och ligger utanför normal API-trust boundary.
Källa: [Supabase JWT](https://supabase.com/docs/guides/auth/jwts).

### 6. Vilka negativa tester krävs?

För varje läs-/mutationsyta: anon/null uid, non-owner AAL1 och AAL2, owner AAL1,
saknad/null/okänd aal, fel JSON-typ, aal2 endast i user_metadata eller AMR,
saknad singleton och owner-mismatch. Allt nekar utan dataläckage eller mutation.
Direkt owner-AAL1 SELECT ger noll rader; direkt RPC ger maskerat unauthorized.
Owner+AAL2 måste positivt fungera för alla historiska och aktiva reads.
Grants/RLS/FORCE RLS, default EXECUTE, inga audit/termswrites och explicit
SECURITY DEFINER-guard testas separat.

App-test: environment-mismatch/unavailable, MFA-fel före repository, requestlokal
SSR och ingen service-role/browserväg. Integrationsgate med verkliga signerade
AAL1/AAL2-token: direkt Data API utan Next, gammal AAL1 efter step-up, ny AAL2,
manipulerad signatur, expired token och annan users token. Manipulerad/expired
token ska nekas vid API-verifieringen. pgTAP med syntetiska requestclaims bevisar
predikaten, inte signaturverifieringen. Ingen remote verifiering körs i F2D1B.

### 7. Lockout och claimstabilitet

aal är dokumenterat; fail-closed exact match undviker beroende av AMR-arrayformat.
Efter step-up kan en gammal AAL1-token fortfarande nekas korrekt: använd ny
sessiontoken via SSR, aldrig AAL1-fallback eller automatisk mutationsretry.
Gammal signerad AAL2 kan bära tidigare assurance tills token uppdateras/upphör;
DB-AAL2 bevisar inte omedelbar sessionrevokering eller att TOTP fortfarande finns.
Appguardens aktuella factor/session-kontroll består. Inga egna JWT-utfärdare,
custom claim hooks eller generell maskinåtkomst ingår i 1.0. Claimdrift ger säker
lockout och kräver kontrollerad felsökning utan råa tokenloggar.
Källa: [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa).

### 8. Slutlig rekommendation och grants

B låses för planeringen. AAL2 behövs på samtliga Licensing-reads och writes.
Appen fortsätter med Owner+AAL2 → service → repository → SSR → RLS/RPC → audit.
DB-AAL2 ersätter inte environment-equality, aktuell Auth-user eller appens TOTP-val.

licenses och license_terms_versions får RLS/FORCE RLS och endast authenticated
SELECT genom kombinerad owner+AAL2-policy, inklusive historik. Audit får RLS/
FORCE RLS, noll policies och noll direkta grants. Alla tre saknar direkta writes
för PUBLIC, anon, authenticated och service_role. Endast smala read/mutations-RPC
får authenticated EXECUTE; PUBLIC, anon, service_role nekas. Funktioner ägs som
befintligt mönster av postgres, har search_path pg_catalog och kvalificerade objekt.
Privilegierad DB-drift kan kringgå dessa skydd; FORCE RLS skyddar inte mot superuser.

## Secrets, metadata och serverarkitektur

API keys, deployment tokens, Supabase secrets, webhook secrets, payment
credentials och egna hemliga licensnycklar saknas helt i Licensing.
Respektive integration använder senare godkänd extern secret manager.
Inga kunddatabascredentials, kundaffärsdata, råa requests eller providerfel lagras.

Framtida lib/server/licenses äger typer, validation, mapper, errors, repository
och service. Server Components anropar servicen direkt, inga interna HTTP-hopp.
Actions är separata per mutation med allowlistad FormData, servergenererad
correlation och frameworkets befintliga origin/CSRF-gräns. Inga JSON-mutationsroutes.
Repository använder requestlokal SSR, bara avsedda SELECT/RPC och inga writes.
Output valideras före DTO-mapping, inklusive scope, ordning, nullability och version.
Tekniska fel loggas endast som säker kategori/tid/correlation; inga råa claims,
actor-ID, snapshotvärden eller SQL-payloads. Ingen cross-request cache.
Actor-UUID ingår i intern audittransport men renderas inte i UI.

## Provisioning eligibility

Serverintern read tar tenant_id och valfritt installation_id. Endast identitet
och immutable tenantrelation konsumeras från Installation. Licensing bedömer
inte installationsstatus, application_url, supabase_project_ref, hosting_region,
deploy, jobb, retries, providerstatus, health eller monitoring.

Normal resultatmodell innehåller eligible boolean, reason, evaluatedAt,
nullable licenseId/revision/termsVersion/validUntil. Inga usagevärden.
Reason är exakt eligible, missing_license, draft, suspended, terminated,
not_started, expired, tenant_unavailable eller tenant_installation_mismatch.
Tekniskt läsfel är en separat maskerad error/unavailable-gren som alltid stoppar
fortsättningen; den får aldrig bli eligible eller maskeras som missing_license.
Ogiltig input/okänd tenant eller installation ger validation_error/not_found.

Efter auktorisering/identitykontroll prioriteras mismatch, tenant unavailable,
licensval, administrativ status och därefter tidsmässig giltighet.
Välj tenantens enda icke-terminerade licens. Saknas den men historisk licens finns
returneras terminated med senaste historiska licens enligt created_at DESC/id DESC.
Saknas all historik returneras missing_license. Aktiv ny licens tar alltså
företräde framför äldre terminated. Status draft/suspended/terminated blockerar
oberoende av datum; active kräver valid. Ingen implicit bypass för pilot/internal.
Ingen varningströskel eller utgångsvarning i minimal 1.0.

Eligibility härleds med DB-tid och ett konsistent readunderlag, lagras inte och
är ingen reservation. Provisioning omprövar vid faktisk start och äger övriga
gates, långvariga jobb och hantering av ändringar under körning. Ingen
förbrukningskontroll påstås. Maskinkonsument behöver separat auktoriserat
integrationskontrakt senare; ingen Service Role- eller fabricerad owner-session.

## List/detail, pagination och Dashboard boundary

Framtida paths: /licenses och /licenses/[licenseId], därefter /licenses/new och
/licenses/[licenseId]/edit. Ingen route eller navigationslänk införs nu.
Listkolumner: Tenant, Plan, Administrativ licensstatus, Tidsmässig giltighet,
Max aktiverade användarkonton, Giltig till/Tills vidare och Uppdaterad.
Ingen singular installationägare eller faktisk usagekolumn.

Filter: tenantId, status, validity och includeTerminated (false som standard).
status=terminated kräver includeTerminated=true; motstridigt filter nekas.
Sökning: endast tenantens legal_name, case-insensitive bokstavlig delsträng,
trimmad, högst 200 tecken; procent/underscore är bokstavliga. Ingen fritextaudit,
pris-, kontakt-, installations- eller metadata-sökning.
Sort: licenses.created_at DESC, id DESC, fast och identisk i DB/mapper.
Ingen strängcollation i sortnyckeln. Standard 50, max 100, limit+1 och keyset.
Full cursor och filterkontext krävs; okända/dubbla parametrar nekas.
nextCursor är null på sista sidan. Ingen offset, total count eller sidnummer.

Cursor innehåller skapandetid/UUID och serverutfärdad evaluatedAt plus
filterbindning. UI återanvänder den oförändrad. Datumgiltighet i en listserie
bedöms vid samma evaluatedAt; framtida/ogiltig tid nekas och tidsvärdet får
aldrig användas för eligibility eller auktorisering. Listan är ingen beständig
DB-snapshot: samtidiga mutationer kan ändra medlemskap. Ogiltig cursor ger
begriplig omladdning från första sidan, inte tyst hopp. Filter/searchändring,
ny listserie eller lyckad mutation återställer cursor och utvärderingstid.
Timestamps bevarar DB-precision genom transport/jämförelse; ingen förlust av
mikrosekunder genom JS Date får ändra tupleordningen.

Detail visar identitet, aktuella villkor, status/giltighet, revision och historik.
Terms history sorteras version DESC, licensbunden keyset, standard 25/max 100.
Audit sorteras occurred_at DESC/id DESC, licensbunden cursor, standard 25/max 100.
Scope, ordning, dubbletter och komplett cursor valideras före append.
Historiska terminerade objekt är läsbara. Status visas med StatusText, aldrig badge.
null valid_until visas Tills vidare; annan nullable metadata Saknas.
Tid presenteras Europe/Stockholm. Actor visas Verifierad owner.
Pending, fokus, maskerade fel, conflict utan retry och success-only revalidation
följer UI_STANDARD. Efter success läses aktuell revision och audit om; lokal
auditpagination återställs på revisionsbyte, utan fabricerade events.

Dashboard implementeras inte. Framtida modulägd summary kan returnera antal
active+valid, antal suspended och antal active+valid med ändligt slut inom ett
explicit intervall (t, windowEnd], samt evaluatedAt/windowEnd.
Detta räknar licenser, inte tillgängliga tenants, installationshälsa eller usage.
windowEnd måste vara efter t; ingen dold standardtröskel. Dashboard läser aldrig
tabeller eller detail-DTO direkt.

## Billing boundary och 1.0-scope

Licensing äger tenantrelation, planidentitet, teknisk rättighet, beviljad
kapacitet, villkor, giltighet, lifecycle, eligibility och audit.
Licensing äger inte pris, moms, rabatt, faktura, betalning, betalstatus,
avtalsfaktura, ekonomisk uppsägning, kommersiella avtalsdatum eller credentials.
Framtida Billing/Contract påverkar endast genom explicit auktoriserad och
auditerad domänmutation. Ingen automatisk koppling betalstatus → licensstatus.

MUST HAVE: de tre tabellkontrakten, sex mutationer, owner+app/DB-AAL2,
revision/atomicitet, list/detail/historik, eligibility och positiva/negativa tester.
SHOULD HAVE: tydlig presentation av tidigare villkorsbeslut utan generell auditpayload.
LATER: usage/konsument, maskinåtkomst, nya planversioner, export/retentionverktyg,
framtida schemaläggning. Modullicensiering/assignments kräver nya change-steps.
OUT OF SCOPE: Billing, Provisioning-jobb, Dashboard-implementation, Monitoring,
kunddatabasåtkomst, secrets och ändring av Tenant/Installation.

## Risker och återstående verifiering

| Risk                            | Sannolikhet/konsekvens | Kontroll                                                         |
| ------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| Dubbel status/datumsanning      | Hög/hög                | Härledd giltighet; ingen expired-kolumn.                         |
| Multiplicerad kapacitet         | Medel/hög              | Tenantpool, inga assignments; usage uttryckligen senare.         |
| Planändring skriver om historik | Medel/hög              | Immutable versioner, explicit planbyte.                          |
| Renewal döljer avbrott          | Medel/hög              | Ny DB-start efter utgång, bevarade snapshots.                    |
| Stale/parallella writes         | Hög/hög                | Row lock, expected revision, unik aktiv tenantlicens.            |
| Tenantavailability-race         | Medel/hög              | FOR SHARE och gemensam låsordning; parallelltest.                |
| Stale eligibility               | Hög/hög                | Omprövning vid start, ingen reservation.                         |
| AAL1 kringgår app               | Medel/hög              | Licensing-specifik DB-AAL2 på alla ytor.                         |
| Claimdrift/tokenstaleness       | Medel/hög              | Fail-closed, signerad integrationstest, befintlig appguard kvar. |
| Audit/terms växer               | Medel/medel            | Smala snapshots, keyset, senare retentionbeslut.                 |
| Cykliska FK/incomplete commit   | Medel/hög              | Deferred integritetstest, rollback och inga direkta writes.      |
| Överdesign/Billing-koppling     | Medel/hög              | Tre tabeller, inga priser/moduler/usage-motor.                   |

Inga blockerande affärsbeslut återstår för denna 1.0-planering. Framtida usage
måste lösa kontoräkning över installationer, men får inte ändra beviljad
tenantpool. Det är integrationsscope, inte en öppen Licensing-affärsregel.
Deploytarget, verklig JWT-/MFA-runtime och operativ retention/backup kräver
verifiering före respektive releasegate; de är inte bevisade av analysen.

## Små efterföljande steg

1. F2D2 Database Foundation: alla tre relationsstrukturerna tillsammans, inklusive
   cykliska FK, unikhet och integritetsgrund. Helt stängda grants; inga appytor.
   Att skjuta terms/audit-tabellerna senare skulle ge en ofullständig FK-grund.
2. F2D3 Owner Read / Security: RLS/FORCE RLS, combined owner+AAL2 och rollmatris.
3. F2D4 Audit and Terms History: append-only-skydd och revisions-/snapshot-
   integritetsbevis. Inga mutationsgrants innan hela skyddet är verifierat.
4. F2D5 Mutations: sex atomiska operationer; tidsgränser, tenantlås, verkligt
   parallella writes, no-op, duplicate och auditfailure/rollback.
5. F2D6 Read/Pagination/Eligibility: metadataallowlist, keyset, scope och DB-tid.
6. F2D7 Server DAL och adapters i separata delsteg: genererade typer, repository/
   service, runtimevalidering, read routes och separata Server Actions.
7. F2D8 UI i små steg: list/detail, create/edit, lifecycle och båda historikvyer.
8. F2D9 Security + Runtime Verification: riktig owner/MFA, direkt AAL1/AAL2 Data
   API, renewalavbrott, concurrency, tenantavailability, pagination och cleanup.

Varje implementation kräver lokal migrations-/typ-/testverifiering enligt
DATABASE_WORKFLOW. Ingen remote write eller deployment ingår här.
Designbeslut är inte en godkänd runtime-Security Pass.

F2D1 classification: READY FOR IMPLEMENTATION PLANNING
