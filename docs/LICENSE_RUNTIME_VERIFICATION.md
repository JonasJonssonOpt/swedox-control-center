# Licensing Runtime Verification

## F2D9 final closure, 2026-10-06

| Fält                       | Resultat                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Tekniskt komplett          | Ja                                                                                 |
| Manuellt runtimeverifierat | Ja, lokalt mot lokal Supabase med riktig owner och MFA                             |
| Säkerhetsverifierat        | Ja: Security Pass godkänd                                                          |
| Verksamhetsklart           | Ja i funktion. Produktionsanvändning kräver cloud-deployment och F2H4-verifiering. |
| Låst/stängt                | Ja. Ändringar endast via analyserat change-step.                                   |
| Omfattning                 | F2D1–F2D9 avslutade                                                                |
| Fixture cleanup            | Godkänd: 0 users, 0 licenses, 0 tenants, 0 owner efter reset                       |
| Slutregression             | 2 071/2 071 pgTAP, 197/197 Node, sju runners gröna                                 |

Baseline är HEAD `42be8fe` (F2D8 committad). Inget har stageats, committats
eller pushats. Ingen remote write eller deployment har gjorts. Användaren
valde att köra webbläsarkontrollen lokalt nu och cloud-verifieringen i den
planerade F2H4.

### Security Pass

**Katalogrevision av den lokala databasen efter clean reset:**

- **Tabeller:** `licenses`, `license_terms_versions` och `license_audit_events`
  har RLS och FORCE RLS. Endast `authenticated` har SELECT, och då bara på
  licenses och terms, via owner+AAL2-policy. Auditen har noll policies och noll
  grants utöver ägaren. Inga writes för PUBLIC, anon, authenticated eller
  service_role.
- **Funktioner:** alla 11 Licensing-RPC:er är SECURITY DEFINER, ägda av
  postgres, med `search_path=pg_catalog`, och EXECUTE endast för
  `authenticated`. Hjälp- och triggerfunktioner saknar API-grants.
- **Anon:** ingen funktion i `public` är körbar för `anon`.
- **Triggers:** alla sju append-only-, truncate- och deferred
  historikintegritetstriggers är aktiva.
- **Lager:** app, server och UI har granskats och testats i F2D7/F2D8. Varje
  serviceoperation kör `requireOwnerIntegrity` (MFA/AAL2 och owner-equality)
  före validering och repository. Repositoryt anropar bara RPC:er, utdata
  runtime-valideras, och actor och correlation når aldrig klienten.
- **Utan session:** `/licenses` ger samma strömmade redirect till `/login`
  som Tenants och Installations, utan licensdata i svaret.
  `/api/licenses` svarar 307 till `/login`.

**Riktiga signerade tokens mot Data API, utan Next.js:**
`node scripts/runtime-tests/verify-licensing-data-api.mjs --local` ger **11/11**.

1. Självregistrering nekas (`signup_disabled`) trots att e-postinloggning är
   påslagen lokalt.
2. Riktig lösenordsinloggning ger AAL1 och riktig TOTP step-up (RFC 6238)
   ger AAL2. Användartokens är ES256-signerade.
3. Owner AAL2 läser, muterar och utvärderar eligibility via Data API.
4. Även owner AAL2 nekas direkt auditläsning och direkta insert, update och
   delete på Licensing-tabellerna (42501).
5. Signerad owner AAL1 nekas på alla 11 RPC:er och ser noll rader.
6. Signerad non-owner AAL2 nekas utan att avslöja om ett id finns.
7. Anon-nyckel utan session saknar EXECUTE och SELECT.
8. En gammal AAL1-token efter step-up, och `aal2` i `user_metadata` eller
   `app_metadata`, nekas.
9. Manipulerad ES256-signatur och token signerad med fel hemlighet avvisas
   (401) innan de når databasen.
10. En utgången token avvisas, medan samma claims med giltig `exp` godtas.
    Kontrollen visar att det just är utgångstiden som avvisas.
11. Inga nekade anrop ändrade licensgrafen.

### Fynd och accepterade restrisker

- **Äldre HS256-hemlighet (inför F2H):** det lokala API:t godtar fortfarande
  den äldre symmetriska JWT-hemligheten, som anon- och service-nycklarna bygger
  på. Den som har den kan skapa en giltig AAL2-token. Det är ingen brist i
  Licensing, men hemligheten är en kritisk serverhemlighet i varje miljö.
  F2H1/F2H4 ska verifiera hur molnprojektets JWT-nycklar hanteras och om äldre
  nycklar kan stängas av.
- **Tokenlivslängd:** som dokumenterat i F2D1B bevisar DB-AAL2 inte omedelbar
  sessionsrevokering. En redan utfärdad AAL2-token gäller tills den går ut.
  Appens aktuella MFA-kontroll består.
- **Lokal auth-config:** `[auth.email] enable_signup` är nu `true` lokalt,
  eftersom CLI:t annars stänger e-postprovidern helt och lokal inloggning blir
  omöjlig. Global `enable_signup = false` blockerar fortfarande
  självregistrering, och runnern bevisar det. Molnet påverkas inte. Ändringen
  är godkänd av användaren.

### Manuell webbläsarkontroll

Gjord av användaren 2026-10-06. Appen kördes lokalt mot lokal Supabase via
processvariabler; `.env.local` lämnades orörd. Inloggningen gjordes med en
lokal owner, skapad via admin-API:t och bootstrappad med
`owner:bootstrap:local` (resultat `bootstrapped`, verify `ok`), och MFA via
mobilapp. Testdatan var 55 syntetiska licenser i blandade lägen med kompletta
historikgrafer, plus en tenant utan licens.

| #   | Kontroll                                                                                 | Resultat |
| --- | ---------------------------------------------------------------------------------------- | -------- |
| 1a  | Standardlistan: 50 rader nyast först, "Nästa sida" med 1 rad, utan dubbletter eller hopp | Godkänd  |
| 1b  | Visa avslutade: 50 rader och därefter 7 rader                                            | Godkänd  |
| 1c  | Statusfilter Utkast: 10 rader utan "Nästa sida"                                          | Godkänd  |
| 2   | Skapa licens: blir Utkast och detail öppnas                                              | Godkänd  |
| 3   | Villkorsändring, aktivera, spärra, återaktivera, förnya (datum och Tills vidare) utan F5 | Godkänd  |
| 4   | Inaktuell flik efter avslut i en annan flik: ändring nekas med begripligt meddelande     | Godkänd  |
| 5   | Svensk tid i sommartidsglappet ger fältfel                                               | Godkänd  |
| 6   | Avslutad licens visar inga åtgärder och ingen "Ändra villkor"                            | Godkänd  |
| 7   | Ändring på licens för pausad tenant nekas                                                | Godkänd  |

Utöver checklistan skapades en ny licens för samma tenant efter avslut. Det
visar att en avslutad licens inte blockerar en ny.

### Slutlig automatiserad regression

| Kontroll                            | Resultat                      |
| ----------------------------------- | ----------------------------- |
| Clean reset, alla migrationer       | Godkänd                       |
| Databaslint                         | Godkänd, inga fynd            |
| pgTAP                               | 2 071/2 071                   |
| Genererade typer                    | Ingen drift mot committad fil |
| F2D4 history/preflight              | 8/8                           |
| F2D5A create concurrency            | 5/5                           |
| F2D5B lifecycle concurrency         | 8/8                           |
| F2D5C terms concurrency             | 7/7                           |
| F2D6 read concurrency               | 7/7                           |
| F2D7 DAL output                     | 7/7                           |
| F2D9 signed Data API                | 11/11                         |
| Node-kontraktstest                  | 197/197                       |
| TypeScript, ESLint, Prettier, build | Godkända                      |
| `git diff --check`, `next-env.d.ts` | Godkänd, återställd           |
| Lokal Supabase och dev-server       | Stoppade                      |

### Kvarstår utanför Licensing-stängningen

- **F2H4 Cloud Verification:** deploya Licensing-migrationerna och appen och
  kör samma checklista i molnet.
- **F2H1:** verifiera JWT-nyckelhanteringen.
- Backup/restore-runbook före verkliga kunddata (Launch_1_0).
