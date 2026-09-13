# F2D4 Licensing History Integrity Verification

Verifierad lokalt 2026-09-13 mot baseline `46ccc12`. F2D4 är implementerad.
Licensing är inte komplett; nästa steg är F2D5, atomiska mutationer.

## Databasmodell

Migration `20260913093631_enforce_licensing_history_integrity.sql` körs atomiskt.
Den låser licenses, terms och audit i fast ordning med SHARE ROW EXCLUSIVE och
kör en läsande preflight före installation. Befintlig inkonsistens avbryter med
23514; ingen historik repareras. Preflight passerade även före första reset.

`prevent_license_terms_version_modification()` och
`prevent_license_audit_event_modification()` blockerar UPDATE (även no-op),
DELETE och TRUNCATE med SQLSTATE 55000 och respektive meddelande
`license terms versions are append-only` och `license audit events are append-only`.
UPDATE/DELETE använder BEFORE ROW; TRUNCATE använder BEFORE STATEMENT.
En UPDATE som inte träffar någon rad aktiverar ingen radtrigger.

`enforce_license_history_integrity()` validerar slutligt tillstånd:

- Audit är exakt revisionerna 1..license.revision.
- Terms är exakt versionerna 1..current_terms_version.
- Terms version 1 introduceras vid revision 1; introduktionsrevisionerna ökar strikt.
- created, terms_changed och renewed har exakt en termsrad vid samma licens
  och revision. Övriga event har ingen sådan termsrad.

COUNT = förväntat slutvärde och MAX = slutvärdet bevisar sammanhängande sekvens
genom befintliga positiva heltal och unika nycklar. Befintliga FK-, CHECK- och
UNIQUE-kontrakt bevaras; inga nya tabeller, kolumner eller index införs.

## Deferred semantics och lås

Tre AFTER ROW constraint triggers är DEFERRABLE INITIALLY DEFERRED: licenses
INSERT/UPDATE samt terms och audit INSERT. Validatorn tillåter endast dessa
tabeller, operationer och triggerkontext. Fel kontext eller struktur ger
23514 med `license history integrity violation`.

Varje körning hämtar aktuell parentrad med FOR NO KEY UPDATE och läser därefter
aktuell historik. Köade NEW-värden används endast för licens-id; äldre köade
revisioner jämförs inte med slutlig historik. Flera revisioner och tillfälliga
mellanlägen i samma transaktion fungerar. SET CONSTRAINTS eller COMMIT kräver
giltig slutgraf. Ingen Tenant-rad låses av validatorn.

Parentlåset serialiserar validering per licens och är kompatibelt med FK:s
KEY SHARE. Olika licenser kan fortsätta parallellt. F2D5 måste fortfarande
ordna sina egna mutationslås konsekvent, särskilt för flera licenser; detta
är inget allmänt löfte om deadlockfrihet för godtycklig framtida kod.
Valideringen läser historiken vid varje köad trigger. Test med 100 revisioner
passerar, men är ingen produktionsbenchmark eller skalbarhetsgaranti.

## Säkerhet och avgränsning

Blockerarna är SECURITY INVOKER; validatorn är SECURITY DEFINER för att även
kunna kontrollera stängd audit efter en framtida privilegierad mutation.
Alla tre är postgres-ägda PL/pgSQL triggerfunktioner, VOLATILE, PARALLEL UNSAFE
med search_path pg_catalog. EXECUTE återkallas från PUBLIC, anon,
authenticated och service_role. Validatorn gör endast läsningar och radlås.

Fyra BEFORE-triggers och tre deferred constraint triggers är aktiva i normalt
origin-läge. F2D3:s read policies, grants och owner+AAL2-helper är oförändrade.
Ingen produkt-RPC, DAL, UI, route, businessmutation eller business-eventdiff
införs. Tenant och Installation ändras inte funktionellt.

Skyddet gäller vanlig DML och framtida privilegierade RPC mot oavsiktlig
historikändring. En privilegierad DB-admin kan ändra schema, stänga av eller
ta bort triggers och använda behöriga replikeringsvägar. Ingen extra
superuser-/replikeringshärdning ingår.

## Verifieringsresultat

- Två rena lokala resetar och hela migrationskedjan passerar.
- Databaslint: inga schemafel.
- Slutlig pgTAP: **1 444/1 444**, 24 filer.
- Node: **162/162**.
- Lokal concurrency/preflight-runner: **8/8**.
- Två typgenereringar är byteidentiska och matchar baseline utan typdiff.
- TypeScript, ESLint och production build passerar; route inventory är oförändrad.
- Prettier och git diff --check passerar. next-env.d.ts är återställd utan diff.
- Efter andra reset är licenses, terms och audit tomma (0/0/0).

Tre nya pgTAP-filer verifierar append-only inklusive TRUNCATE CASCADE,
rollback, sekvenser, terms/event-relation, deferred mellanlägen, exakt
funktions-/triggerkatalog och stängd audit. En testlokal definerfunktion
visar att deferred kontroll fungerar efter återgång till authenticated utan
EXECUTE på triggerfunktionerna. Fel triggerkontext nekas.

Äldre Licensing CHECK-prober använder INSERT så att de fortsatt testar sina
ursprungliga constraints utan att stoppas först av append-only. En enda rad
i tenant_mutations_test.sql uppdaterar en global audit-funktionsnamnslista
för den nya blockeraren; inga Tenant-kontrakt eller produktfunktioner ändras.

## Riktig lokal samtidighet

`node scripts/runtime-tests/verify-licensing-history-concurrency.mjs --local`
använder separata psql-sessioner i repositoryts lokala Docker-databas, med
timeouts och kontroller av faktiska blockerare:

1. Giltig skapandegraf committas.
2. Konkurrerande samma revision väntar; efter första commit nekas den andra med 23505.
3. Efter första transaktionens rollback kan väntande konkurrent committa.
4. KEY SHARE blockerar inte validatorns NO KEY UPDATE.
5. Validatorn väntar på parentlås och nekar sedan ogiltig framtida audit med 23514.
6. Annan licens kan committa medan första licensen är låst.
7. Migrationens exakta preflight godkänner giltig befintlig graf.
8. Samma preflight nekar transaktionellt injicerad korruption utan reparation;
   rollback återställer ursprungsläget.

Runnern avslutade 8/8 på cirka två sekunder. Efterföljande reset städar
committade syntetiska fixtures; inga triggers inaktiveras för städning.
Den injicerade negativa preflight-proben är testdata, inte upptäckt korruption.

## Kvarstår

F2D5–F2D9 och senare roadmapsteg återstår. Signerad Data API-runtime och
cloud-verifiering är inte genomförda i F2D4. Inga cloud-operationer, commit
eller push ingår. Denna rapport avser lokal strukturell databasintegritet.
