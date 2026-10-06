# Provisioning Domain Design

## F2E1: domänanalys och låsta beslut, 2026-10-06

F2E1 är ett analys- och beslutssteg. Inga migrationer, ingen kod, inga routes
och ingen UI ingår. Tabeller, statuskoder, felmodell och idempotensnycklar låses
i detalj i F2E2. Användaren fattade fyra produktbeslut 2026-10-06:

| Fråga                     | Beslut                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| Omfattning i 1.0          | Spårad runbook: fasta steg som owner utför och registrerar, med licenskontroll vid start     |
| Resultat mot Installation | Provisioning lagrar egna resultatreferenser. Installation återöppnas inte.                   |
| Körning                   | Owner-drivna steg. Ingen bakgrundsprocess, kö, cron eller polling i 1.0.                     |
| Provider-hemligheter      | Endast som server-only miljövariabler i Control Centers hosting, aldrig i DB/Git/logg/klient |

### Varför eget Supabase-projekt per kundinstallation

Bindande beslut i [Projektbeslut](PROJECT_DECISIONS.md) ("Systemgräns"),
bekräftat i F2E1. Det ger fysisk isolering av kunddata, auth och backup;
region, restore, export och avveckling per kund; begränsad skada vid fel; och
ingen kunddata eller generell databasåtkomst i Control Center. Kostnaden är
compute per projekt och flera projekt att migrera och övervaka. En gemensam
multi-tenant-databas vore ett beslut om SweDox huvudsystem och ändrar inte
denna analys.

## Repository truth

- Tenant och Installation är stängda. Licensing är stängd och publicerar
  `get_license_provisioning_eligibility`, som uttryckligen inte är en
  reservation; Provisioning ska ompröva den vid faktisk start.
- Installationens `supabase_project_ref`, `application_url` och
  `hosting_region` är nullable administrativ metadata (F2C9A). Aktiv
  installation betyder inte provisionerad eller frisk.
- Appen är Next.js utan bakgrundsprocess. Alla skyddade operationer kör
  owner + MFA/AAL2 + equality på servern och använder RPC:er med DB-AAL2.
- Ingen providerintegration, inga provider-hemligheter och ingen
  Provisioning-tabell finns.

## Ansvar och ownership

Provisioning **äger**:

- provisioneringskörningar per installation, deras steg och försök
- egna resultatreferenser: Supabase project ref, region och application URL
  som provisioneringen tog fram
- operatörsregistrerade utfall och stängda felkategorier
- sin egen append-only metadata-audit

Provisioning **äger inte**:

- installationens administrativa fält eller status, tenant eller licens
- installerad SweDox-version och deploystatus över tid (framtida
  deployment-domän)
- hälsa, tillgänglighet, incidenter och larm (Monitoring)
- kunddata, kunddatabaser eller kunders credentials

## Konsumerade kontrakt

- **Installation** (läses i DB, aldrig skrivs): `id`, `tenant_id`,
  `environment`, `administrative_status` och `archived_at`. Provisioning får
  starta och driva steg endast för en installation som är `planned` eller
  `active` och inte arkiverad. Paused, decommissioned och arkiverad blockerar.
  Varje utökning av listan kräver ett change-step.
- **Tenant**: endast tillgänglighet (`operational_status = active` och inte
  arkiverad), härledd via installationens immutable tenantrelation.
- **Licensing**: `get_license_provisioning_eligibility(tenant_id,
installation_id)`. `eligible` krävs. Alla andra orsaker, och
  `technical_read_error` i serverlagret, blockerar. Eligibility dupliceras
  aldrig och lagras inte som sanning; endast orsakskoden vid ett blockerat
  försök sparas som historik.

Provisioning skriver aldrig Tenant, Installation eller Licensing.

## Modell: körning, steg och försök

En **körning** (run) är ett provisioneringsjobb för exakt en installation.
Relationen är immutable. En installation kan ha många körningar över tid men
högst en icke-avslutad samtidigt.

Körningen har en fast, versionerad **stegkatalog** (v1), som utförs i ordning:

| #   | Steg                   | Resultatreferens som får registreras |
| --- | ---------------------- | ------------------------------------ |
| 1   | Skapa Supabase-projekt | project ref, hosting region          |
| 2   | Kör SweDox-migrationer | ingen                                |
| 3   | Deploya SweDox-app     | application URL                      |
| 4   | Verifiera installation | ingen                                |

Steg 4 är operatörens intygande att appen svarar och att inloggningen fungerar
vid provisioneringstillfället. Det är inte hälsa och ersätter inte Monitoring.

Varje start av ett steg skapar ett **försök** (attempt) med löpnummer, start,
slut, utfall och, vid fel, en stängd felkategori. Försök är append-only.
Fritext begränsas i F2E2 till en kort, valfri operatörsnotering som uttryckligen
inte får innehålla hemligheter; UI:t varnar.

## State machine

Körning:

| Status        | Betydelse                                                         | Nästa                                         |
| ------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| `pending`     | Begärd, inget steg startat                                        | `in_progress`, `cancelled`                    |
| `in_progress` | Ett steg pågår eller nästa steg kan startas                       | `succeeded`, `failed`, `blocked`, `cancelled` |
| `blocked`     | Förutsättning saknas vid stegstart (licens, tenant, installation) | `in_progress`, `cancelled`                    |
| `failed`      | Senaste försöket misslyckades; manuell retry möjlig               | `in_progress`, `cancelled`                    |
| `succeeded`   | Alla steg klara. Terminal.                                        | inga                                          |
| `cancelled`   | Avbruten av owner. Terminal.                                      | inga                                          |

Steg: `pending` → `in_progress` → `succeeded` eller `failed`. Ett misslyckat
steg kan startas igen, vilket ger ett nytt försök. Steg n+1 kan bara startas när
steg n har lyckats. Inga steg hoppas över i v1.

Avbrott river aldrig resurser. Deprovisioning ingår inte i 1.0; registrerade
referenser bevaras som historik.

## Licens- och förutsättningskontroll

Före varje stegstart, inklusive retry, och när en körning begärs:

1. installationen är `planned` eller `active` och inte arkiverad
2. tenanten är tillgänglig
3. licensen är `eligible` vid DB-tid i samma transaktion

Om något inte är uppfyllt startas inget steg. Körningen blir `blocked` med
orsakskod och ett blockerat försök registreras, så att historiken visar varför.
Efter åtgärd i rätt domän kan owner försöka igen. Ett redan påbörjat steg
avbryts inte retroaktivt om licensen ändras under steget, eftersom
eligibility inte är en reservation. Nästa steg prövas på nytt.

## Retry, avstämning och inaktuella jobb

- **Ingen automatisk retry.** Retry är alltid en uttrycklig owner-åtgärd med
  expected revision.
- **Avstämning (reconciliation)** i 1.0 betyder att owner registrerar faktiskt
  utfall för ett pågående steg utifrån vad som syns hos providern. Exempel:
  projektet skapades trots att webbläsaren tappade svaret, så steget markeras
  lyckat med referens. Ingen polling sker.
- **Inaktuellt steg:** ett steg som varit `in_progress` längre än en tröskel
  (låses i F2E2) visas som inaktuellt i UI:t. Det är härlett och lagras inte.
  Owner avgör utfallet.
- **Halvgjorda steg:** om en resurs finns men steget registrerades som
  misslyckat ska retry återanvända den befintliga resursen och registrera dess
  referens. Ett nytt projekt skapas inte. Runbooken säger detta uttryckligen.

## Provider boundary och framtida automation

- **Server-only abstraktion:** en provider-abstraktion införs i F2E6 med ett
  enda adapter i 1.0, `manual`. Den utför inga nätverksanrop. Den översätter
  bara operatörens registrering till domänhändelser.
- **Senare automation:** en adapter som till exempel Supabase Management API
  kräver ett eget analyserat change-step. Då gäller följande:
  - hemligheten ligger endast i hostingens server-only miljövariabler
  - varje försök har en deterministisk idempotensnyckel som skickas till providern
  - körningen är fortsatt owner-driven, eller får en separat analyserad
    maskinidentitet om bakgrundskörning införs
- **UI:** UI:t och klienten anropar aldrig en provider direkt.

## Secret boundary

Följande lagras aldrig i Control Center:

- kundprojektens databaslösenord, service role keys, JWT-hemligheter och
  anslutningssträngar
- provider-tokens och deploy-tokens

Provisioning lagrar endast identifierare: project ref, region, URL och ett
eventuellt referensnamn för en framtida hemlighet, aldrig värdet. Owner
förvarar kundprojektens credentials utanför Control Center, i sin egen
lösenordshanterare. Loggar får endast innehålla kategori, tid och correlation.

## Relationer

- **Installation:** Provisioning visar sina resultatreferenser bredvid
  installationens administrativa fält och markerar skillnader, men skriver dem
  aldrig. Owner uppdaterar installationen via dess befintliga edit-flöde om så
  önskas.
- **Licensing:** endast via eligibility-kontraktet, som omprövas vid varje
  stegstart.
- **Monitoring:** får läsa publicerade Provisioning-reads (körningens status
  och resultatreferenser). `succeeded` betyder bara att provisioneringen
  genomförts, inte att systemet är friskt. Provisioning skapar inga larm.
- **Dashboard:** endast via framtida modulägd summary-read.

## Audit

Egen append-only `provisioning_audit_events`, metadata-only, med samma mönster
som Licensing:

- revisionskedja per körning, actor från `auth.uid()` och valfri
  servergenererad correlation
- `changed_fields` i kanonisk ordning
- RLS och FORCE RLS, noll policies och läsning endast via en körningsbunden
  paginerad RPC

Försök och steg är i sig historik; audit beskriver vem som gjorde vad och när.

## Concurrency och idempotens

- **Låsordning för varje Provisioning-mutation:** Installation → Tenant →
  körning. Installation och Tenant låses `FOR KEY SHARE`, i samma ordning som
  Installation-mutationerna, och körningen `FOR NO KEY UPDATE`. Den slutliga
  lås-modellen och deadlocktester låses i F2E2 och verifieras med riktiga
  parallella transaktioner i F2E5.
- **Expected revision** på körningen för varje owner-åtgärd. En gammal flik får
  `conflict` och ingen automatisk retry.
- **Partiellt unikt index:** högst en icke-avslutad körning per installation,
  så dubbla begäranden ger `duplicate_run`.
- **Försöksnummer** är unika per steg. Samma stegstart två gånger parallellt
  serialiseras, och den andra får `conflict`.
- **Tidsstämplar:** ett `clock_timestamp()` tas efter låsen per mutation, som i
  Licensing.

## Säkerhet

Samma modell som Licensing:

- Owner + MFA/AAL2 + equality i appen, och DB-AAL2 i varje RPC och policy.
- SECURITY DEFINER-RPC:er med `pg_catalog`, EXECUTE endast för `authenticated`.
- Inga direkta writes och audit stängd.
- Signerade tokentester mot Data API i F2E10.

## Risker

| Risk                                           | Kontroll                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| Provisionering startas utan giltig licens      | Eligibility i samma transaktion vid varje stegstart                 |
| Dubbla körningar eller dubbla projekt          | Partiellt unikt index, expected revision, retry återanvänder resurs |
| `succeeded` tolkas som frisk installation      | Uttrycklig text; hälsa ägs av Monitoring                            |
| Hemligheter i fritext eller loggar             | Ingen hemlighetslagring, kort notering med varning, loggpolicy      |
| Avvikelse mellan Installation och Provisioning | Sida-vid-sida-visning och markering; ingen tyst synk                |
| Inaktuella pågående steg                       | Härledd markering och avstämning av owner                           |
| Framtida automation öppnar stor attackyta      | Kräver eget change-step; endast serverhemligheter                   |

## 1.0-scope

- **Ingår:** körningar, stegkatalog v1, försök, owner-drivna övergångar,
  retry, avbrott, avstämning, resultatreferenser, licens- och
  förutsättningskontroll, audit, läsytor och UI.
- **Ingår inte:**
  - provider-API-anrop och bakgrundskörning
  - deprovisioning och automatisk synk till Installation
  - versions- och deployhistorik över tid
  - hälsa och larm
  - kundadministration i kundprojekt

## Efterföljande steg

1. **F2E2 Decision Lock / Implementation Plan:**
   - tabeller och kolumner
   - statuskoder och felkategorier
   - felmodell (inklusive `duplicate_run` och `blocked`-orsaker)
   - inaktualitetströskel och noteringsgränser
   - exakt låsmodell
2. **F2E3 Database Foundation:** körningar, steg, försök och audit med stängda
   grants och integritet.
3. **F2E4 Owner Read / Security.**
4. **F2E5 Mutations / State Machine:** begär, starta steg, registrera utfall,
   retry, avbryt och avstäm. Inkluderar licensomprövning och concurrency.
5. **F2E6 Provider Layer:** abstraktion och `manual`-adapter.
6. **F2E7 Reconciliation / Failure Handling:** inaktuella steg, halvgjorda
   steg, terminala fel.
7. **F2E8 DAL/API/Actions** och **F2E9 UI**: status, senaste försök,
   felorsak, start, retry, historik och relation till tenant/installation.
8. **F2E10 Runtime / Security Closure:** inklusive signerade tokens,
   licensomprövning, concurrency och manuell webbläsarkontroll.

F2E1 classification: READY FOR DECISION LOCK (F2E2)
