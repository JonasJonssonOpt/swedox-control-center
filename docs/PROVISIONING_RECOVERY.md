# Provisioning Recovery

## F2E7: Reconciliation / Retry / Failure Handling, 2026-10-06

Baseline är HEAD `f9e56b4` (F2E6 committad). Inget har stageats, committats
eller pushats. Migration: `20261006235000_add_provisioning_list_staleness.sql`.

## Operatörsguide

Provisioning i 1.0 är en spårad runbook. Control Center gör aldrig något på
egen hand: det försöker inte igen automatiskt och river inga resurser. Varje
återhämtning är ett uttryckligt beslut av dig och syns i historiken.

| Läge                                          | Vad det betyder                                                                                                             | Vad du gör                                                                                                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inaktuellt steg** (pågått mer än 24 timmar) | Ett steg startades men inget utfall registrerades, till exempel för att fliken stängdes. Markeringen är bara en påminnelse. | Kontrollera hos Supabase eller hostingen vad som faktiskt hände. Registrera sedan _lyckat_, med resultat om steget har sådana, eller _misslyckat_. Filtret "Endast inaktuella" i listan hittar alla sådana körningar. |
| **Misslyckat steg**                           | Senaste försöket misslyckades, med kategori och eventuell anteckning.                                                       | Åtgärda orsaken och starta steget igen. Det blir ett nytt försök med nästa nummer, och tidigare försök finns kvar i historiken.                                                                                       |
| **Halvfärdigt steg**                          | Resursen skapades, men steget registrerades som misslyckat, eller svaret tappades.                                          | Skapa **inte** en ny resurs. Starta steget igen och registrera den befintliga resursens referens.                                                                                                                     |
| **Blockerat**                                 | Installation, tenant eller licens var inte tillgänglig vid start. Orsaken visas.                                            | Åtgärda i rätt modul, till exempel genom att aktivera licensen eller tenanten, och starta igen. Blockeringen registreras som ett försök.                                                                              |
| **Fel resultat registrerat**                  | Ett lyckat steg har låsta resultat som inte kan ändras.                                                                     | Avbryt körningen och begär en ny. Den gamla bevaras som historik. Den nya kan registrera rätt eller befintlig resurs.                                                                                                 |
| **Ger upp**                                   | Kunden eller installationen ska inte provisioneras nu.                                                                      | Avbryt körningen. Ett pågående försök stängs som avbrutet. Inga resurser rivs; det gör du själv vid behov.                                                                                                            |

**Utfall går alltid att registrera.** Även om licensen spärrats eller tenanten
pausats under ett steg kan du registrera vad som faktiskt hände. Det är först
nästa _start_ som prövar förutsättningarna igen.

**Ingen automatisk gräns för antal försök.** Varje försök syns med nummer,
utfall och kategori, och felkategorin visar mönstret, till exempel upprepade
`quota_or_billing`.

**Samtidiga ändringar** från två flikar eller en sen registrering efter ett
avbrott ger konflikt. Ladda om och utgå från det aktuella läget. Det blir
aldrig två utfall för samma försök.

## Ändring i F2E7

`list_provisioning_runs` visar nu:

- öppet steg
- starttid för det öppna försöket
- härlett `is_stale` med 24 timmars tröskel
- utvärderingstid
- nytt filter `p_only_stale`

Inaktualiteten härleds vid läsning och lagras aldrig. Returtypen ändrades, så
funktionen ersattes genom drop och create. Ingen anropare fanns än.

## Testevidens

- Clean reset och DB-lint utan fynd. Full pgTAP **2 771/2 771** i 40 filer.
- **Ny fil `provisioning_recovery_test.sql`.** Den kör de riktiga F2E5-RPC:erna:
  1. Inaktuellt försök (30 timmar) syns i stale-filtret och i detaljvyn och
     stäms av sent som lyckat.
  2. Inaktuellt försök stäms av som misslyckat och görs om med ett nytt försök.
  3. Halvfärdigt steg: två misslyckade försök följs av ett lyckat med samma
     befintliga projekt.
  4. Licensen spärras och tenanten pausas mitt i steget. Utfallet registreras
     ändå. Nästa start blockeras först av tenanten och därefter av licensen,
     och körningen återupptas efter åtgärd.
  5. Upprepade fel: blockerade och misslyckade försök numreras i en följd.
  6. Ogiltiga resultat flyttar aldrig körningen framåt, och registrerade
     resultat är oförändrade.
  7. En inaktuell körning avbryts och bevaras. En ny körning registrerar samma
     befintliga projekt.
  8. En körning som blockerats två gånger avbryts, med exakt en audit-händelse
     per åtgärd.
- **Uppdaterade läs-tester:** ny signatur och returtyp, inaktualitet och
  stale-filter i listan, samt validering av NULL i filtret.
- **Mutationsprob**, där alla tre fångades:
  - stale-filtret ignoreras (2 fel)
  - tröskel 0 i listan (1)
  - utfall kräver giltig licens (15)
- **Typer:** två genereringar är byteidentiska.
  SHA256 `F3A99F07606BF010E51E4C1730341EC618C18B7A744B887B525D54732CB83F07`.
- Node **202/202**, typecheck, ESLint, Prettier, build och `git diff --check`.

### Riktiga kapplöpningar

`node scripts/runtime-tests/verify-provisioning-recovery-concurrency.mjs --local`
passerar **5/5**:

1. Ett avbrott pågår: en sen registrering av lyckat utfall med samma revision
   väntar och får `conflict`. Försöket förblir avbrutet.
2. Efter avbrottet kan inte ens aktuell revision registrera utfall
   (`invalid_state_transition`).
3. Lyckat och misslyckat utfall registreras samtidigt: det första vinner och
   det andra får `conflict`. Exakt ett utfall finns.
4. Detaljvyn och stale-listan svarar utan att vänta på en pågående mutation.
5. Revision är lika med antal auditposter för varje körning.

Alla åtta lokala runners passerar från ren databas: Licensing 8/8, 5/5, 8/8,
7/7, 7/7 och 11/11 samt Provisioning 8/8 och 5/5.

Nästa steg: F2E8 – Provisioning DAL / API / Server Actions.
