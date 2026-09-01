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

### Global navigation och applikationsram

Control Centers permanenta interna ram består av en vänsterställd sidomeny,
en enkel toppheader och ett konsekvent huvudområde. Auth-, MFA- och felvyer
ligger utanför ramen. Domänsidor får inte skapa egna globala sidomenyer,
toppheaders eller `<main>`-landmarks.

Sidomenyn visar den låsta modulordningen Dashboard, Tenants, Installations,
Licenses, Provisioning, Monitoring och Settings. Endast implementerade moduler
är länkar. I F2A är endast Tenants klickbar och markerad med text samt
`aria-current="page"`. Övriga poster visar vanlig text `Kommer senare` och
saknar interaktiv kontroll, route och placeholder-sida.

Toppheadern visar endast `Control Center` och `Verifierad owner`. Profilmeny,
avatar, sök, notifieringar och logout ingår inte. Shellkomponenten äger
konsekvent maxbredd, horisontell padding och vertikal rytm. Domänvyer får
använda en smalare intern maxbredd när formulär eller detailinnehåll kräver det.

Applikationsramen är desktop first och övergår vid smalare normalbredder till
en staplad struktur utan separat mobilnavigation. Navigationen är semantisk,
tangentbordsnåbar och har synliga fokusmarkeringar. Aktiv modul och
framtidsstatus förmedlas aldrig med badge eller enbart färg.

### Tabeller

- Kolumnordning, rubriker, justering och formatering ska vara konsekventa mellan moduler.
- Sortering, filtrering, paginering, tomlägen och laddning ska följa gemensamma mönster.
- Primär identifierare ska vara enkel att skanna och rader ska ha förutsägbara åtgärder.
- Fel och saknade värden ska visas explicit, inte döljas som tomt innehåll.

### Formulär

Installationsmodulens create/edit-flöde återanvänder ett gemensamt formulär.
Create visar tenant, installationskod, visningsnamn, environment och valfri
teknisk/administrativ metadata. Edit visar tenant, kod, environment och status
som skrivskyddad kontext och låter endast den muterbara målbilden ändras.
Fältfel kopplas med `aria-describedby` och `aria-invalid`; formulärfel får fokus
och pending-state inaktiverar submit med verbet `Skapar…` eller `Sparar…`.
Arkiverade installationer visar ingen edit-form.

- Etiketter, hjälptexter, obligatoriska fält och valideringsfel ska placeras konsekvent.
- Serverfel ska visas nära relevant åtgärd eller fält och bevara användarens inmatning när det är säkert.
- Primär och sekundär åtgärd ska ha konsekvent ordning.
- Destruktiva åtgärder ska vara tydliga och kräva proportionerlig bekräftelse.

### Detaljsidor

- Sidhuvud, identitet, status, metadata, primära åtgärder och relaterad information ska följa samma struktur i alla moduler.
- Viktiga avvikelser och begränsningar ska framgå före kompletterande information.
- Navigation tillbaka till listan och mellan relaterade objekt ska vara förutsägbar.

### Tenant read UI

Tenantlistan finns på `/tenants` och detail på `/tenants/[tenantId]`. Initial
data laddas i dynamiska Server Components direkt genom tenantservicen. Intern
HTTP via API-routes, klienthämtning och cross-request cache används inte.

Listan är en kompakt semantisk tabell med juridiskt namn som detail-länk,
organisationsnummer, kategori, operativ status, kontaktperson och uppdateringstid.
Servicens ordning bevaras. Sökning, filter, pagination, total count och
mutationskontroller ingår inte i read-mönstret.

Detail använder sektionerna Identitet, Kontakt, Operativ status, Administration
och Metadata. Saknade nullable värden visas som `Saknas`. Actor-UUID visas inte;
den databaskontrollerade actorrollen beskrivs som `Verifierad owner` tills ett
separat säkert visningsnamnskontrakt finns.

Operativ status och arkiveringsstatus visas med `StatusText` och entydig svensk
text, aldrig badges eller enbart färg. Arkiverad tenant får dessutom en tydlig
textförklaring före övriga uppgifter. Datum visas i svensk locale och
Europe/Stockholm; canonical organisationsnummer formateras endast för
presentation som `NNNNNN-NNNN`.

### Tenant create och edit

Create finns på `/tenants/new` och edit på `/tenants/[tenantId]/edit`.
Serverpages skyddar initial åtkomst, medan en liten Client Component använder
`useActionState` med E7B:s Server Actions. Formuläret får inte importera service,
Supabase, repository eller RPC.

Create visar kategori, organisationsnummer, juridiskt namn, kontaktfält och
administrativ notering. Edit visar kategori och land skrivskyddat och redigerar
endast de sex tillåtna verksamhetsfälten. Arkiverad tenant får ingen
submitkontroll. Expected revision transporteras dolt men betraktas som opålitlig
input och verifieras alltid server-side och i databasen.

Serverresultatet kan innehålla allowlistade `fieldErrors`. Fältfel kopplas med
`aria-invalid` och `aria-describedby`; formulärfelet har `role="alert"` och får
fokus efter svar. Conflict visas som ett formulärfel med instruktion att lämna
editvyn och läsa in aktuell detail igen. Automatisk overwrite eller retry är
förbjuden.

Kontrollerade inputvärden bevarar användarens data vid fel. Submit är disabled
och visar `Sparar…` under requesten. Efter lyckad create/update revalideras endast
tenantlistan och relevant detail, varefter servern redirectar till detail.

### Tenant lifecycle controls

Tenantdetail visar state-specifika livscykelkontroller. Aktiv tenant visar
`Pausa` och `Arkivera`, pausad visar `Aktivera` och `Arkivera`, och arkiverad
visar endast `Återställ`. Edit och övriga statuskontroller visas inte för
arkiverad tenant.

Varje åtgärd använder en native dialog med rubrik, konsekvensbeskrivning,
Avbryt och explicit bekräftelse. Pause/activate är neutrala reversibla
kontroller. Restore förklarar att tenant blir aktiv. Archive är visuellt
separerad och destruktivt formgiven samt förklarar att tenant försvinner från
aktiva listan men inte raderas.

Varje kontroll har egen action- och pending-state. Knappen inaktiveras och visar
operationsspecifik pågående text. Dialogen fokuserar Avbryt vid öppning, native
Escape stänger den och fokus återgår till triggern.

Conflict och invalid state visas som alerts med instruktion att stänga dialogen
och läsa om detail. Efter success revalideras endast lista/detail och servern
redirectar tillbaka till uppdaterad detail. Inga badges, target-statusfält eller
audit history ingår i lifecyclemönstret.

### Tenant audit history

Tenantdetail visar en egen sektion `Händelsehistorik` direkt på
`/tenants/[tenantId]`, även för arkiverade tenants. Initialsidan laddas med 25
poster direkt genom `listTenantAuditEvents()` i Server Component. En minimal
Client Component använder därefter endast
`GET /api/tenants/[tenantId]/audit` för `Ladda fler`.

Historiken är en semantisk kronologisk lista i servicens låsta ordning, nyast
först. Varje post visar svensk eventtext, svensk tid i Europe/Stockholm,
`Verifierad owner`, revision och användarvänliga namn på ändrade fält. Den visar
aldrig actor-UUID, audit-ID, correlation-ID, tidigare eller nya fältvärden.

Cursorparet kommer endast från verifierat service-/API-resultat och hålls i
komponentstate. Inga offsetvärden, total counts eller page-size-kontroller
finns. Resultat valideras före append och dubbletter, fel ordning, fel tenant
eller ofullständigt cursorpar stoppas. Tom historik är neutral. Load-more-fel
visas lokalt med befintliga poster kvar, och pending blockerar parallella
requests.

Historiken har inga badges, filter, sökning, export, retention- eller
backupkontroller.

### Installation list och detail

Installationslistan finns på `/installations` och detail på
`/installations/[installationId]`. Båda är dynamiska Server Components som
anropar installationsservicen direkt. Intern HTTP, browser-Supabase och
cross-request cache används inte. Root fortsätter till `/tenants`; Tenants och
Installations är de enda klickbara globala modulerna.

Listan är desktop-first med en kompakt filterrad och semantisk tabell. Filter
för sökning, tenant, environment, administrativ status och arkiverade objekt
ligger i URL-query. Sökningen beskrivs uttryckligen som namn och
installationskod. Listan sorteras endast enligt servicekontraktet och använder
cursorlänken `Nästa sida`; total count, sidnummer och offset används inte.

Kolumnerna är Installation, Tenant, Environment, Administrativ status, Region,
Application host och Uppdaterad. Installationskod visas sekundärt under
detail-länken. Environment och status har svenska etiketter och status visas
med `StatusText`, aldrig badge eller enbart färg.

Detail använder sektionerna Identitet, Teknisk metadata, Administration och
Metadata. Full application URL, Supabase project ref och administrativ notering
visas endast där, som säker ren text. Notering bevarar radbrytningar utan HTML
eller Markdown. Arkiverad installation har en tydlig text före sektionerna och
förklarar frånvaron i standardlistan. F2C8A innehåller inga create-, edit-,
lifecycle- eller auditkontroller.

### Installation lifecycle controls

Installationdetail visar endast state-tillåtna kontroller: planned visar
Aktivera/Avveckla, active visar Pausa/Avveckla, paused visar
Aktivera/Avveckla, decommissioned visar Arkivera och arkiverad visar endast
Återställ. Förbjudna operationer renderas inte som inaktiva dead controls.

Varje operation använder native dialog med kopplad rubrik och beskrivning,
Avbryt som initialt fokus, Escape-stöd och fokus tillbaka till triggern.
Avveckling är terminal i V1. Arkivering är destruktivt formgiven men texten
förklarar att data inte raderas och status förblir Avvecklad. Återställning
återger endast synlighet och aktiverar inte installationen.

Aktiveringsdialogen beskriver `Aktiv` som administrativ status och förklarar
uttryckligen att den inte verifierar faktisk systemhälsa, provisioning eller
deployment. Saknad application URL, project ref eller region presenteras som
saknad metadata och påstås inte blockera administrativ aktivering.

Pending visas med operationsspecifikt verb och låser samtliga lifecycle-
triggers mot parallella mutationer. Fel visas som alerts. Status förblir vanlig
text via `StatusText`; badges används inte.

### Installation audit history

Installationdetail visar `Händelsehistorik` direkt på samma route, även när
installationen är arkiverad. Initiala 25 poster laddas server-side via
installationsservicen; `Ladda fler` använder endast befintlig audit-GET-route.

Historiken är en kompakt ordnad lista, nyast först. Varje post visar svensk
eventetikett, tid i Europe/Stockholm, `Verifierad owner`, revision och svenska
namn på ändrade fält. Actor-UUID, audit-ID, correlation-ID och tidigare/nya
värden visas aldrig. Pagination valideras före append och använder synkron
request-lock. Fel visas lokalt med befintliga poster kvar.

Inga badges, timeline-dekorationer, filter, sökning, infinite scroll, polling,
realtime, export, retention eller backupkontroller ingår.

### Nullable teknisk metadata i installationslistan

Listans application host och hosting region visas som vanlig text `Saknas` när
värdet är null. Nullable metadata får inte ge tomma celler, texten `null` eller
en badge/statusindikator.

### Installation audit freshness efter mutation (F2C9D)

Efter en lyckad installationsmutation ska detail och audit renderas från samma
nya server-snapshot utan manuell omladdning. Auditkomponenten ska återställas
när installationens revision ändras, så att första sidans items, cursor,
`hasMore`, pending- och feltillstånd inte återanvänds från föregående revision.
Installationsrevisionen är den tillåtna, icke-känsliga versionssignalen.

### Låst Installation Management-mönster (F2C9H)

Den stängda installationsmodulen använder serverrendererad metadata-minimerad
lista, URL-bundna filter och literal search samt keyset-pagination med bevarad
filterkontext. Nullable host och region visas som vanlig text `Saknas`; status
visas som text enligt den globala UI-standarden, aldrig som informationsbärande
badge.

Detail, create/edit-formulär, native lifecycle-dialoger och state-specifika
kontroller följer samma tillgängliga fokus-, pending- och felmönster. Audit är
en semantisk newest-first-lista med routebaserad cursorpagination och omedelbar
revisionskonsistent refresh efter mutation. Dessa mönster är runtimeverifierade
och ändras endast genom ett nytt analyserat change-step.

## Relaterade dokument

- [Projektbeslut](PROJECT_DECISIONS.md)
- [Modulstatus](MODULE_STATUS.md)
