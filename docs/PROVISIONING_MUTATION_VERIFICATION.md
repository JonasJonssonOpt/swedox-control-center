# Provisioning Mutation Verification

## F2E5: Mutations / State Machine, lokalt verifierad 2026-10-06

Baseline är HEAD `7fa8947` (change-step med första administratör committad).
Inget har stageats, committats eller pushats. Migration:
`20261006230000_create_provisioning_mutations.sql`. Kontraktet följer F2E2 med
fem steg; se [Provisioning Domain Design](PROVISIONING_DOMAIN_DESIGN.md).

### RPC:er

Alla fem är VOLATILE och SECURITY DEFINER, ägda av postgres, med
`search_path=pg_catalog` och EXECUTE endast för `authenticated`. Varje anrop gör
följande, i ordning:

1. Prövar owner+AAL2 på nytt och binder actor till `auth.uid()`.
2. Validerar indata.
3. Låser Installation → Tenant (`FOR KEY SHARE`) → körning (`FOR NO KEY UPDATE`).
4. Tar ett `clock_timestamp()` som beslutstid.
5. Jämför expected revision före tillstånd.
6. Höjer revisionen med 1 och skriver exakt en auditpost.

| RPC                                                                  | Kontrakt                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request_provisioning_run(installation, corr)`                       | Kräver tillgänglig installation, tenant och licens. Annars `installation_not_available`, `tenant_not_available` eller `license_not_eligible`. Högst en öppen körning per installation: `duplicate_run`, även när två anrop sker parallellt. Skapar fem väntande steg. |
| `start_provisioning_step(run, rev, corr)`                            | Härleder nästa ej lyckade steg. Prövar installation, tenant och licens på nytt. Vid hinder registreras ett blockerat försök med orsak, körningen blir `blocked` och anropet lyckas. Annars öppnas ett försök. Ett nytt start efter ett misslyckat försök är retry.    |
| `complete_provisioning_step(run, rev, ref, region, url, note, corr)` | Kräver ett öppet försök. Tar exakt de resultat som steget äger: steg 1 project ref och region, steg 3 URL, övriga inga. Verifieringssteget avslutar körningen med `run_succeeded`.                                                                                    |
| `fail_provisioning_step(run, rev, category, note, corr)`             | Kräver ett öppet försök. Tar en sluten felkategori och en valfri anteckning. Körningen blir `failed`.                                                                                                                                                                 |
| `cancel_provisioning_run(run, rev, corr)`                            | Gäller alla icke-avslutade körningar. Ett öppet försök stängs som `cancelled`, och inga resurser rivs.                                                                                                                                                                |

Den interna `provisioning_block_reason` prövar installation, tenant och
licens, i den ordningen. Licensen prövas via Licensings eligibility-kontrakt i
samma transaktion. Funktionen saknar API-grant. Ett oväntat
eligibility-resultat stoppar med ett maskerat fel och blir aldrig godkänt.

Avslut, misslyckande och avbrott kräver inga förutsättningar, eftersom de
registrerar något som redan har hänt. Tenanten låses ändå för att låsordningen
ska vara enhetlig. Låset tas med `perform`, så att DB-lint inte varnar för
oanvända variabler.

### Testevidens

- Clean reset och DB-lint utan fynd. Full pgTAP **2 724/2 724** i 39 filer,
  varav 279 nya tester i två filer:
  - `provisioning_mutation_test.sql`:
    - hela livscykeln genom alla fem steg, med resultat och anteckning
    - misslyckande och retry
    - resultatvalidering per steg, URL- och formatkrav, anteckningsregler
    - konflikt och otillåtna övergångar, även efter att körningen är klar
    - begäran nekas för pausad, avvecklad och arkiverad installation, pausad
      och arkiverad tenant samt saknad, utkast, spärrad, avslutad, ej påbörjad
      och utgången licens
    - licensen spärras mitt i körningen via Licensings RPC, vilket ger två
      blockerade försök, och återaktiveras sedan, varefter körningen fortsätter
    - installationen pausas och återaktiveras mitt i körningen
    - avbrott från väntande, pågående med öppet försök, blockerad och misslyckad
    - en avslutad eller avbruten körning frigör installationen
    - exakt auditkedja, correlation och actor
    - att den deferred integritetskontrollen godkänner alla grafer
  - `provisioning_mutation_security_test.sql`:
    - signatur, returtyp, härdning, standardvärden och ACL
    - endast tillåtna argument: inga för actor, status eller steg
    - att hjälpfunktionen är intern
    - 11 nekade claimformer per RPC, både före och efter att en körning finns,
      och att auktorisering går före validering
    - saknad singleton, anon och service_role
    - att nekade anrop inte skriver något
    - att direkta skrivningar är stängda
- Uppdaterad inventering i F2E3-testet: de sex nya funktionerna.
- Mutationsprob: sex försvagningar fångades:
  - licensorsaker ignoreras (25 fel)
  - installationsstatus ignoreras (11)
  - stegstart utan revisionskontroll (1)
  - resultat tillåts på alla steg (18)
  - avbrott lämnar försöket öppet (3)
  - `duplicate_run` mappas inte (1)

  En första version av licensproben var felskriven och fick testfilen att
  avbrytas. Den gjordes om och gav rena testfel.

- Typer: två genereringar är byteidentiska.
  SHA256 `20BF7E9F24D6C64A858212F24B204B3853132BF455F1FF17C5852AAE5FFE938F`.
- Node **197/197**, typecheck, ESLint, Prettier, build och `git diff --check`.

### Riktig lokal concurrency

`node scripts/runtime-tests/verify-provisioning-mutation-concurrency.mjs --local`
passerar **8/8**:

1. Två parallella begäranden för samma installation: den andra väntar på
   indexet och får `duplicate_run`. Exakt en körning finns.
2. Om den första rullar tillbaka lyckas den väntande begäran.
3. Två parallella stegstarter med samma revision: den andra väntar på
   körningslåset och får `conflict`. Exakt ett försök finns.
4. En pågående `pause_installation` håller installationen. Stegstarten väntar
   och registrerar sedan `installation_not_available`.
5. En pågående `pause_tenant` håller tenanten. Stegstarten väntar och
   registrerar sedan `tenant_not_available`.
6. En pågående `suspend_license` blockerar inte en stegstart, eftersom
   eligibility inte är en reservation. Nästa start ser den committade
   spärren och blir `license_suspended`.
7. Mutationer på olika körningar serialiseras inte mot varandra.
8. Varje committad körning har revision lika med antal auditposter.

Alla sju lokala runners passerar från ren databas: Licensing 8/8, 5/5, 8/8,
7/7, 7/7 och 11/11 samt Provisioning 8/8.

### Implementationsnoter

- **Testerna:** de saknar tabellgrants även för owner. Hjälpfunktioner som
  läser tabellerna är därför SECURITY DEFINER i testsessionen, och direkta
  kontrollfrågor körs som postgres.
- **Runnern:** den slår upp körnings-id via den privilegierade sessionen och
  skickar dem som värden.

Nästa steg: F2E6 – Provider Integration Layer. Abstraktionen och den manuella
adaptern, samt analysen av det signerade SweDox-API:t för inbjudan och status.
