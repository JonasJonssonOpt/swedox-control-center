# Licensing UI Verification

## F2D8: Licensing UI, lokalt kontraktsverifierad 2026-10-06

Baseline är HEAD `87aa01b` (F2D7 committad). Inget har stageats, committats
eller pushats. F2D8 är implementerad och kontraktsverifierad. Manuell
webbläsarverifiering med riktig owner, MFA och databas återstår och ingår i
F2D9. Inga databas- eller serverlagerändringar ingår.

### Routes

| Route                        | Innehåll                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/licenses`                  | Kompakt tabell: Tenant, Plan, Administrativ status, Giltighet, Max aktiverade användarkonton, Giltig till och Senast uppdaterad. URL-filter för sökning, tenant, status, giltighet och Visa avslutade. Keyset via "Nästa sida". |
| `/licenses/new`              | Skapa licens för en aktiv tenant: paket, start och slut i svensk tid. Licensen skapas som Utkast.                                                                                                                               |
| `/licenses/[licenseId]`      | Sektionerna Licens, Aktuella villkor och Metadata, samt åtgärder, villkorshistorik och händelsehistorik.                                                                                                                        |
| `/licenses/[licenseId]/edit` | Ändra villkor. Utkast ersätter hela målbilden; aktiv och spärrad licens byter endast paket och visar datumen skrivskyddat. Avslutad licens kan inte ändras.                                                                     |

Licenses är nu klickbar i den globala navigationen och använder samma skal
som Tenants och Installations. Rotens redirect till `/tenants` är oförändrad.

### UI-regler

- **Status som text:** status och giltighet visas med `StatusText` och svenska
  etiketter: Utkast, Aktiv, Spärrad och Avslutad respektive Ej påbörjad, Giltig
  och Utgången. Inga badges.
- **Tomma värden:** `null` som sluttid visas som Tills vidare. Annan saknad
  data visas som Saknas.
- **Svensk tid:** alla tider visas i Europe/Stockholm. Formulärens
  `datetime-local` tolkas som svensk lokal tid; se F2D7.
- **Aktör:** visas som Verifierad owner. Actor-UUID och correlation-ID når
  aldrig klienten. Initial auditdata kopieras genom en allowlist-parser innan
  den skickas till klientkomponenten.
- **Utvärderingstid:** listan visar när giltigheten bedömdes, och nästa sida
  bedöms vid samma tidpunkt.
- **Ogiltig cursor:** en ogiltig eller inaktuell cursor, eller cursor
  tillsammans med ändrade filter, ger ett begripligt meddelande med länken
  "Läs in första sidan" i stället för ett rått fel. Ogiltiga filter ger
  "Återställ filter".

### Åtgärder

Endast åtgärder som är tillåtna i aktuellt läge renderas. Regeln speglar
databasreglerna och ligger i `licenseOperations` i
`lib/licenses/license-presentation.ts`:

| Status   | Åtgärder                                                                     |
| -------- | ---------------------------------------------------------------------------- |
| Utkast   | Aktivera (inte om utgången) och Avsluta. Villkor ändras via "Ändra villkor". |
| Aktiv    | Förnya (inte vid Tills vidare), Spärra och Avsluta.                          |
| Spärrad  | Återaktivera (inte om utgången), Förnya (inte vid Tills vidare) och Avsluta. |
| Avslutad | Inga åtgärder. Texten förklarar att en ny licens måste skapas.               |

Varje åtgärd öppnar en native dialog med konsekvenstext, Avbryt som initialt
fokus, Escape och fokus tillbaka till knappen. Avslut är destruktivt formgivet.
Förnyelse kräver antingen ny sluttid eller Tills vidare. Konflikt, ogiltig
övergång och otillgänglig tenant visas som alerts med instruktion att ladda om.
Efter lyckad åtgärd revalideras lista och detail och servern redirectar till
detail. Åtgärdskontroller, villkorshistorik och händelsehistorik keyas på
revision och monteras om från den nya snapshoten.

### Testevidens

- `tests/license-ui.contract.test.mjs` (8 tester):
  - åtgärdsmatrisen för alla status- och giltighetskombinationer
  - rundtur för svensk tid
  - auditparsern tar bort actor och correlation och validerar ordning, scope och cursor
  - termsparsern
  - list-, detail-, formulär- och dialogkontrakt
  - klientkomponenter importerar bara typer från `lib/server`
  - inga badges eller identifierare
- Uppdaterade kontrakt:
  - Navigationstestet: tre klickbara moduler, och Licenses-routes använder
    skalet utan egen `<main>`.
  - Adapter-testet: `app/licenses/actions.ts` exporterar exakt sex Server Actions.
- Mutationsprober: sju avsiktliga försvagningar applicerades tillfälligt, till
  exempel aktivering av utgången licens, actor-läcka i auditkopian, saknad
  revisionsnyckel, värdeimport från serverlagret i en klientkomponent, datumfält
  för aktiv licens och tappade sekunder. Sex fångades. Den sjunde tog bort
  auditparserns dubblettkontroll, men en dubblett avvisas ändå av
  ordningskontrollen; kontrollen är alltså ett redundant extraskydd.
  Filerna verifierades byteidentiska efteråt.
- Regression: Node **197/197**, typecheck, ESLint, Prettier, production build
  (fyra nya dynamiska sidor) och `git diff --check`. Inga databasändringar;
  pgTAP 2 071 är oförändrat sedan F2D7.

### Manuell webbläsarkontroll (F2D9)

Logga in som owner med MFA och kontrollera:

1. **Lista och filter:** `/licenses` visar listan. Filter och "Nästa sida"
   fungerar, och en manipulerad `cursor` i URL:en ger meddelandet "Läs in
   första sidan".
2. **Skapa:** licensen skapas som Utkast och detail visas direkt.
3. **Livscykel:** aktivera, spärra, återaktivera, förnya (ny sluttid och Tills
   vidare) och ändra villkor. Status, villkorshistorik och händelsehistorik ska
   uppdateras utan F5.
4. **Konflikt:** en ändring i två flikar ger konfliktmeddelande med instruktion
   att ladda om, och ingen automatisk retry.
5. **Avsluta:** efter avslut visas inga åtgärder och inte heller "Ändra villkor".
6. **Svensk tid:** tider runt sommartidsbytet nekas med begripligt fältfel.
