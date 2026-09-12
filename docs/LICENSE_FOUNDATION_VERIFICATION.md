# F2D2: lokal verifiering

Datum: 2026-09-12. Granskad kodbaseline: `94f2425`.

## Omfattning och resultat

Migrationen `20260909064727_create_licensing_foundation.sql` innehåller
`licenses`, `license_terms_versions` och `license_audit_events`. Verifieringen
avser databasgrund med stängd åtkomst, inte färdig Licensing-produkt.

Docker var initialt avstängt. Efter start av Docker Desktop kunde projektets
lokala Supabase-stack startas. Hela migrationskedjan applicerades med
`npm run supabase:reset` mot lokal databas; ingen remoteoperation utfördes.

| Kontroll                                                                 | Resultat                                    |
| ------------------------------------------------------------------------ | ------------------------------------------- |
| Lokal start, reset och status                                            | Godkända                                    |
| `npm run supabase:lint`                                                  | Inga schemafel                              |
| `npm run supabase:test`                                                  | 1 088/1 088 godkända, 20 filer              |
| Fyra Licensing-pgTAP-filer                                               | Alla godkända; 284 test utöver tidigare 804 |
| `node --import ./tests/register-server-only.mjs --test tests/*.test.mjs` | 158/158 godkända                            |
| Genererade Licensing-tabelltyper                                         | Matchar befintliga typer                    |
| Global typdriftkontroll                                                  | Godkänd efter korrigeringen nedan           |
| `npm run lint`                                                           | Godkänd                                     |
| `npm run typecheck`                                                      | Godkänd                                     |
| `npm run build`                                                          | Godkänd production build                    |

Den första Node-körningen utan testladdaren misslyckades med modulupplösning.
Tabellens godkända resultat gäller det fullständiga kommandot med testladdare.

Databastesterna verifierar bland annat exakta tabellkontrakt, paketvärden,
datumgränser, unik icke-terminerad tenantlicens, relationsintegritet inklusive
uppskjutna FK-kontroller, RLS/FORCE RLS samt nekad åtkomst för `anon`,
`authenticated` och `service_role`. Testtransaktionerna rullas tillbaka.

## Åtgärdad avvikelse: befintlig global typdrift

Slutlig `npm run format:check` passerade för hela repositoryt. Lokal Supabase
stoppades efter verifieringen. Byggets genererade ändring i `next-env.d.ts`
återställdes. Efterföljande ändringar av typverktygen beskrivs nedan.

`npm run supabase:types` följt av
`git diff --exit-code -- lib/supabase/database.types.ts` ger fem skillnader,
samtliga i `list_installations.Returns`: `application_host`, `archived_at`,
`hosting_region`, `next_cursor_display_name` och `next_cursor_id` genereras
som `string` medan repositoryt har `string | null`.

Licensing-delarna har ingen drift. SQL-funktionen i
`20260729200000_stabilize_installation_list_collation.sql` returnerar nullable
metadata och null för nästa cursor på sista sidan. Rå typgenerering saknar
denna nullability trots det befintliga kontraktet.

Projektägaren godkände därefter en smal analys/fix av typkontrollen.
`scripts/generate-database-types.mjs` kör den pinnade lokala CLI:n och
`scripts/database-type-overrides.mjs` kompletterar exakt de fem fälten via
TypeScript-parsern. Inga SQL-, domän-, runtime- eller befintliga typkontrakt
ändras. CLI-fel, syntaxfel, saknade fält och oväntade fälttyper stoppar
genereringen innan målfilen skrivs. Övrig drift bevaras för CI-jämförelsen.

Två efterföljande lokala genereringar gav oförändrad `database.types.ts` och
godkänd full git-jämförelse. Fyra nya tester verifierar nullable-komplettering,
idempotens, bevarad orelaterad drift och avvisning av inkompatibel output.
CI kör testerna före sin befintliga fullständiga typjämförelse. Den ursprungliga
underkända kontrollen är därmed åtgärdad lokalt; någon ny
remote CI-körning har inte gjorts.

Efter fixen passerade hela Node-sviten med 162/162 test samt ESLint och
TypeScript. Med lokal Supabase stoppad verifierades också att genereringen
returnerar fel och lämnar typfilen byteidentisk. Lokal Supabase lämnades stoppad.

## Kvarstående arbete

F2D3 owner-read och DB-AAL2, F2D4 append-only-/revisionsintegritet, F2D5
mutationer samt efterföljande läsning, serverlager, UI och verklig
runtimeverifiering återstår. F2D2:s stängda grants är inte bevis för framtida
owner/AAL2-åtkomst eller atomiska produktmutationer. Ingen deployment eller
Licensing Security Pass ingår i denna verifiering.
