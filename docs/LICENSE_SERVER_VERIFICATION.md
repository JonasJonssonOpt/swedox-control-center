# Licensing Server Verification

## F2D7: Server DAL / Service Layer, lokalt verifierad 2026-10-06

Baseline är HEAD `f2250e1` (F2D5 och F2D6 committade). Inget har stageats,
committats eller pushats. F2D7 är komplett på serverlagernivå. Licensing som
helhet är inte komplett; F2D8 UI och F2D9 Security + Runtime återstår. Inga
databasändringar ingår.

### Struktur

`lib/server/licenses/` följer samma mönster som Tenant och Installation:

| Fil                       | Ansvar                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `license.types.ts`        | DTO:er, slutna enum-listor och planbibliotek v1 (Mini 24, Standard 49, Stor 100).                 |
| `license.validation.ts`   | Indatavalidering och tidsstämplar med mikrosekundsprecision (BigInt, aldrig JS `Date`).           |
| `license-cursor.ts`       | Opak listcursor bunden till serien och hela filterkontexten.                                      |
| `license.mapper.ts`       | Strikt runtimevalidering av all RPC-utdata före DTO.                                              |
| `license.errors.ts`       | Stabila felkoder och maskerad loggning: endast kategori, händelse, tid och correlation.           |
| `license.repository.ts`   | Endast de elva Licensing-RPC:erna via requestlokal SSR-klient. Inga tabellanrop.                  |
| `license.service-core.ts` | Guard, validering, repository och mapper i den ordningen.                                         |
| `license.service.ts`      | Produktionskoppling med `requireOwnerIntegrity` och `createSupabaseServerClient`.                 |
| `license-read-route.ts`   | Kärna för läs-routes: allowlistade unika parametrar, no-store och felmappning.                    |
| `license-action-core.ts`  | Kärna för Server Actions: allowlistad FormData, svensk lokal tid och servergenererad correlation. |
| `index.ts`                | Publik yta: service, fel och DTO-typer. Repository, mapper och cursor exporteras inte.            |

Fyra läsroutes: `GET /api/licenses`, `/api/licenses/[licenseId]`,
`/api/licenses/[licenseId]/terms` och `/api/licenses/[licenseId]/audit`.
Alla är `force-dynamic`, `revalidate = 0` och `private, no-store`.

### Säkerhetsordning

`requireOwnerIntegrity` körs först i varje serviceoperation. Den kräver
full-access owner med MFA/AAL2 (`requireFullAccessOwner`) och därefter samma
owner i miljövariabeln och DB-singletonen. Först sedan valideras indata och
skapas repositoryt. DB-AAL2 i varje RPC är ett andra, oberoende lager.

### Kontrakt

- **Lista:** filter för tenant, status, giltighet, `includeTerminated` och
  sökning (trimmad, högst 200 kodpunkter). `status=terminated` kräver
  `includeTerminated`. Standard 50, max 100.
- **Listcursor:** en opak base64url-token med `created_at`, id, seriens
  `evaluatedAt` och hela det normaliserade filtret. Ändrat filter, manipulerad
  token, okänd version eller för lång token ger `validation_error` innan DB
  anropas. Token är ingen hemlighet eller behörighet; DB validerar position och
  tid igen.
- **Tidsstämplar** behålls som oförändrad DB-text med mikrosekunder genom hela
  kedjan. Ordning och giltighet jämförs med BigInt-mikrosekunder.
- **Mappern** avvisar fel ordning, dubbletter, motsägande giltighet, fel
  plansnapshot, versaler i UUID, cursor som inte pekar på sista raden, rader
  utanför exakta filter och felaktiga auditkedjor eller `changed_fields`.
  Sökfiltret kontrolleras inte i mappern, eftersom skiftlägeshantering i JS och
  DB kan skilja sig utanför ASCII.
- **Eligibility** returnerar `{ kind: "evaluated", eligibility }` eller
  `{ kind: "technical_read_error", correlationId }`. Den tekniska grenen saknar
  `eligible` och kan därför aldrig läsas som tillåten eller som `missing_license`.
  `unauthorized`, `validation_error` och `not_found` kastas som domänfel.
  Ingen HTTP-route finns för eligibility.
- **Mutationer** returnerar en validerad `License`-DTO utan actorfält.
  Renewal kräver uttryckligt `validUntil`, där `null` betyder Tills vidare och
  skickas som explicit `null` till `renew_license`.
- **Server Action-kärnan** läser bara allowlistade fält. Kapacitet, etikett,
  termsversion, actor och correlation från klienten ignoreras. Tider anges som
  svensk lokal tid (`YYYY-MM-DDTHH:mm`) och omvandlas till en exakt UTC-tid.
  Tider i vårens sommartidsglapp och höstens dubbla timme nekas i stället för
  att gissas. Renewal kräver antingen ny sluttid eller `openEnded=true`, aldrig
  båda och aldrig ingen av dem.

### Testevidens

- Två nya Node-testfiler med totalt 20 tester:
  `tests/license-service.contract.test.mjs` och
  `tests/license-adapters.contract.test.mjs`.
  - Guarden körs före validering och repository för alla elva operationer.
  - Ogiltig indata når aldrig repositoryt.
  - Exakta RPC-argument, inklusive explicit `null` vid renewal och utelämnade
    standardvärden.
  - Felmappning, och att loggar saknar payload.
  - Mikrosekundsjämförelse, mapperavvisningar, cursorbindning och manipulering.
  - Eligibility-grenar, routes, actions och sommartidsfall.
  - HTTP-ytan är exakt fyra GET-routes.
- Mutationsprob: tio avsiktliga försvagningar applicerades tillfälligt, till
  exempel validering före guard, cursor utan filterbindning, tillåtna
  dubbletter, `not_found` maskerat som tekniskt fel, renewal-null utelämnad,
  correlation från klienten, tvetydig sommartid accepterad och dubbla
  parametrar tillåtna. Alla fångades. Ett test som först fångade dubbletter av
  fel anledning skärptes. Filerna verifierades byteidentiska efteråt.
- Riktig DB-utdata:
  `node --import ./tests/register-server-only.mjs scripts/runtime-tests/verify-licensing-dal-output.mjs --local`
  passerar **7/7**. Utdata från alla elva RPC:er serialiseras med
  `json_agg`/`row_to_json`, samma serialisering som PostgREST, och passerar de
  strikta mapparna. List-, terms- och audit-cursors går fram och tillbaka mot
  DB utan glapp eller dubbletter.
- Regression: pgTAP **2 071/2 071** (oförändrat), Node **188/188**, typecheck,
  ESLint, Prettier, production build och `git diff --check`.

### Inte i F2D7

- **"use server"-filen och sidor:** den tunna `"use server"`-filen
  (`app/licenses/actions.ts`) och sidroutes ingår i F2D8, tillsammans med
  formulär och revalidering av de sidor som F2D8 skapar.
- **Navigation:** ingen navigationslänk.
- **Signerade tokens:** test mot Data API med verkliga signerade AAL1/AAL2-tokens
  och runtime med riktig owner/MFA hör till F2D9.
