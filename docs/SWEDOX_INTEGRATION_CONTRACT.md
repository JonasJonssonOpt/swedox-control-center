# SweDox Integration Contract

## F2E6: analys och kontraktsförslag, 2026-10-06

Detta dokument beskriver det smala, signerade server-API som varje kunds
SweDox-installation ska exponera för Control Center. Det är ett förslag som
låstes i F2E6.

**Implementation:** i SweDox-repot efter F2E10, enligt ägarens ordning. Därefter
ersätter Control Center de manuella kopplingarna för "första administratör" och
"verifiering" med automatiska, och Monitoring (F2F) använder statusanropet.
Varje sådan ändring är ett eget change-step med säkerhetsgranskning.

### Utgångspunkter

- **Eget Supabase-projekt per kund.** SweDox AD-001/AD-003 och Control Centers
  systemgräns gäller.
- **Inga kundnycklar i Control Center.** SweDox säkerhetsstandard säger att
  service role-nycklar aldrig får lämna kundinstallationens servermiljö.
  Control Center håller därför inga kundnycklar och har ingen direkt åtkomst
  till kunddatabaser.
- **Befintligt inbjudningsflöde återanvänds.** SweDox har redan detta: en rad i
  `user_licenses` (roll `admin`, `can_login`, `is_active`) följd av
  `inviteUserByEmail` till `/auth/callback` och `/auth/set-password`. Det som
  saknas i SweDox är just första administratören.

### Gränssnitt i kundens SweDox

Båda anropen är `POST` med JSON-kropp, som högst får vara 8 KB, och samma
signaturkontroll.

| Anrop                                          | Syfte                                                  |
| ---------------------------------------------- | ------------------------------------------------------ |
| `/api/control-center/v1/initial-administrator` | Skapa kundens första administratör och skicka inbjudan |
| `/api/control-center/v1/status`                | Kort hälsorapport för Monitoring och verifiering       |

### Autentisering: signerade anrop

**Algoritm:** Ed25519. Den finns inbyggd i Node, har korta nycklar och kräver
ingen delad hemlighet.

**Nycklar:**

- Control Centers privata nyckel ligger endast som server-only miljövariabel i
  Control Centers hosting, `CONTROL_CENTER_SIGNING_PRIVATE_KEY`. Den lagras
  aldrig i DB, Git, loggar eller klient.
- Varje SweDox-installation har tre miljövariabler:
  - `CONTROL_CENTER_SIGNING_PUBLIC_KEYS`, en eller två publika nycklar för
    rotation
  - `CONTROL_CENTER_KEY_IDS`
  - `CONTROL_CENTER_INSTALLATION_ID`, installationens id i Control Center

**Headers:**

- `X-CC-Key-Id`
- `X-CC-Installation`
- `X-CC-Timestamp` (Unix-sekunder)
- `X-CC-Nonce` (UUID)
- `X-CC-Signature` (base64url)

**Signerad text:** sju rader i följande ordning. Den första raden binder
versionen, och den sista binder kroppen.

1. `SWEDOX-CC-v1`
2. HTTP-metoden
3. sökvägen
4. installationens id
5. tidsstämpeln
6. nonce
7. SHA-256 av kroppen, i hex

**Kontroll i SweDox, i ordning.** Varje fel ger `401` utan detaljer och loggas
i SweDox som säker kategori.

1. `X-CC-Installation` är lika med den egna `CONTROL_CENTER_INSTALLATION_ID`.
   Det binder anropet till en mottagare, så ett anrop till kund A kan aldrig
   spelas upp mot kund B.
2. Tidsstämpeln ligger inom ±300 sekunder.
3. Nyckel-id:t är känt och signaturen giltig.
4. Nonce har inte använts. Den lagras med utgångstid i en liten SweDox-tabell
   med unikt index, och återanvändning nekas.
5. Kroppen har exakt de tillåtna fälten.

### Första administratör

**Begäran:**
`{ "full_name": text 1–120, "email": e-post, "correlation_id": uuid }`.

**Beteende:**

- **Idempotent.** Finns redan en aktiv `admin` med inloggning svarar SweDox
  `{"status":"already_exists"}` och ändrar ingenting.
- **Annars** skapar SweDox en rad i `user_licenses` med roll `admin`,
  `can_login` och `is_active` samt full åtkomst. Därefter skickas inbjudan via
  befintligt flöde, och svaret är `{"status":"invited"}`.
- **Vid fel** blir svaret `{"status":"failed","category":"…"}` med en stängd
  kategori. Inga interna detaljer skickas.
- **Svaret innehåller aldrig** inbjudningslänk, token, användar-id eller
  lösenord.

**I Control Center:** steget registreras som lyckat vid `invited` eller
`already_exists`, och annars som misslyckat med kategori. Administratörens
namn och e-post skickas i anropet. Om de ska sparas i Control Center beslutas
i F2E8. Control Centers egen policy tillåter namn och e-post för support, men
Provisioning-tabellerna har inga sådana fält.

### Status

**Begäran:** `{ "correlation_id": uuid }`.

**Svar, endast drift-metadata:**

- `status`: `ok` eller `degraded`
- `swedox_version`
- `schema_version`, den senaste applicerade migrationen
- `database`: `ok` eller `error`
- `auth`: `ok` eller `error`
- `checked_at`

Exakt vilka nyckeltal som läggs till låses i F2F1, till exempel antal aktiva
webbanvändare eller lagringsstorlek, som Control Center-beslutet i SweDox
nämner. Svaret får aldrig innehålla kunddata som projekt, fakturor, dokument
eller personuppgifter.

### Hot och skydd

| Hot                                   | Skydd                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Control Centers privata nyckel läcker | Serverhemlighet i hostingen, rotation via två publika nycklar. Anropet kan bara skapa administratör där ingen finns och läsa status. Audit i båda systemen. |
| Uppspelning av anrop                  | Tidsfönster, engångs-nonce och bindning till installationens id                                                                                             |
| Anrop mot fel kund                    | Installations-id är en del av signaturen och kontrolleras mot mottagarens egen konfiguration                                                                |
| Avlyssning                            | Endast HTTPS. Control Center anropar bara den URL som provisioneringen registrerade för installationen.                                                     |
| Läckage via svar                      | Svaren är allowlistade och innehåller inga länkar, tokens eller kunddata                                                                                    |
| Felaktig dubbel inbjudan              | Idempotens: finns en aktiv administratör ändras ingenting                                                                                                   |

### Ansvar per system

- **SweDox:**
  - de två anropen och signaturkontrollen
  - nonce-tabellen
  - första administratör enligt ovan
  - de tre miljövariablerna
  - egen Security Pass före första kund
- **Control Center** (efter F2E10, som change-steps):
  - signering
  - en automatisk koppling för `initial_administrator` och för verifiering
  - Monitoring-insamling i F2F
  - rotation av nyckeln

  Den manuella vägen finns kvar som reserv.

### Öppet

- Var Control Center ska hostas och hur nyckeln roteras operativt (F2H).
- Statusnyckeltalen (F2F1).
- Om administratörens kontaktuppgifter sparas i Control Center (F2E8).
