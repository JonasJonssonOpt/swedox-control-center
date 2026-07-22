# UI Standard

## Syfte

Denna standard definierar ett konsekvent, effektivt och återanvändbart gränssnitt för SweDox Control Center.

## Grundprinciper

### Desktop first

Control Center utformas desktop first för interna arbetsflöden med tangentbord, stora datamängder och flera samtidiga informationsytor. Kritiska arbetsflöden ska fortfarande förbli begripliga vid smalare bredder.

### Enterprise UI

Gränssnittet ska vara neutralt, förutsägbart och uppgiftsorienterat. Visuell utsmyckning får inte konkurrera med information, beslut eller avvikelser.

### Gemensam komponentstruktur

Återkommande mönster ska byggas med gemensamma komponenter och enhetliga kontrakt. Domänmoduler ska återanvända etablerade komponenter för navigation, tabeller, formulär, detaljvyer, återkoppling och felhantering.

### Hög informationstäthet

Vyer ska visa tillräcklig information för effektivt internt arbete utan onödiga mellanrum eller dekorativa ytor. Täthet får inte försämra läsbarhet, fokusordning eller tillgänglighet.

## Status

Status ska presenteras med den gemensamma komponenten `StatusText`. Texten ska vara entydig och får kompletteras med en konsekvent färg eller ikon när detta förbättrar förståelsen.

Badges får inte användas för status. Status får inte förmedlas enbart med färg.

## Standardmönster

### Tabeller

- Kolumnordning, rubriker, justering och formatering ska vara konsekventa mellan moduler.
- Sortering, filtrering, paginering, tomlägen och laddning ska följa gemensamma mönster.
- Primär identifierare ska vara enkel att skanna och rader ska ha förutsägbara åtgärder.
- Fel och saknade värden ska visas explicit, inte döljas som tomt innehåll.

### Formulär

- Etiketter, hjälptexter, obligatoriska fält och valideringsfel ska placeras konsekvent.
- Serverfel ska visas nära relevant åtgärd eller fält och bevara användarens inmatning när det är säkert.
- Primär och sekundär åtgärd ska ha konsekvent ordning.
- Destruktiva åtgärder ska vara tydliga och kräva proportionerlig bekräftelse.

### Detaljsidor

- Sidhuvud, identitet, status, metadata, primära åtgärder och relaterad information ska följa samma struktur i alla moduler.
- Viktiga avvikelser och begränsningar ska framgå före kompletterande information.
- Navigation tillbaka till listan och mellan relaterade objekt ska vara förutsägbar.

## Relaterade dokument

- [Projektbeslut](PROJECT_DECISIONS.md)
- [Modulstatus](MODULE_STATUS.md)
