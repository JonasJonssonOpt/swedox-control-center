# Owner-bootstrap

## Syfte och status

Owner-bootstrap är en explicit, administrativ driftoperation som kopplar en
redan verifierad Supabase Auth-user till Control Centers enda owner-singleton.
F1 implementerar mekanismen och en local-only CLI. Den skapar aldrig Auth-users,
webbroutes, Server Actions, UI eller generell användaradministration.

Bootstrapdata är miljöspecifik och finns inte i migration, seed eller Git.
Migrationen `20260728170000_create_owner_bootstrap_admin_api.sql` innehåller
endast den skyddade mekanismen.

## Låst databasmodell

`public.control_center_owner` har fyra `NOT NULL`-kolumner:

- `singleton_key smallint default 1`
- `owner_user_id uuid`
- `created_at timestamptz default current_timestamp`
- `updated_at timestamptz default current_timestamp`

PK och check kräver exakt `singleton_key = 1`. Owner-ID är unique och refererar
`auth.users(id)` med `ON DELETE RESTRICT`. Tabellen ägs av `postgres`, har RLS
och FORCE RLS utan policies och saknar grants för `PUBLIC`, `anon`,
`authenticated` och `service_role`.

## Vald bootstrapmetod

Två funktioner finns i det icke-exponerade schemat `private`:

- `private.bootstrap_control_center_owner(uuid)`
- `private.get_control_center_owner_bootstrap_status(uuid)`

Båda är security-invoker, ägs av `postgres` och saknar EXECUTE för samtliga
API-roller. Endast en privilegierad DB-administratör kan använda dem.
Bootstrapfunktionen låser singletontabellen under operationen, verifierar att
Auth-usern finns och skriver endast när tabellen är tom.

Den lokala CLI:n använder den entydigt identifierade lokala
Supabase-databascontainerns `psql`. UUID skickas via stdin, inte som
processargument. CLI:n lagrar eller loggar aldrig UUID eller credentials.

Staging och production kör samma privata funktion med en kontrollerad
`postgres`-administrativ anslutning. Service Role används inte.

## Input och resultat

CLI:n kräver:

- `CONTROL_CENTER_OWNER_USER_ID`: ett trimmat UUID
- `CONTROL_CENTER_BOOTSTRAP_TARGET=local`
- flaggan `--confirm-owner-bootstrap`, inbyggd i npm-scriptet

Kategoriska databasresultat:

| Status                         | Betydelse                                                        |
| ------------------------------ | ---------------------------------------------------------------- |
| `bootstrapped`                 | Tom singleton fylldes med existerande Auth-user.                 |
| `already_bootstrapped`         | Samma owner fanns; ingen write utfördes.                         |
| `ok`                           | Verifiering visar matchande Auth-user och DB-owner.              |
| `auth_user_not_found`          | Auth-usern saknas; ingen write.                                  |
| `owner_mismatch`               | En annan owner finns; ingen takeover eller write.                |
| `missing_database_owner`       | Verifiering visar att singletonen är tom.                        |
| `invalid_database_owner_state` | Singletoninvarianten kan inte verifieras; fail-closed.           |
| `invalid_input`                | Null input nekades i databasen. CLI nekar ogiltigt UUID före DB. |

Publik CLI-output innehåller endast kategorisk status eller ett generiskt fel.

## Auth-user och miljövariabel

Auth-usern skapas först genom Supabase Dashboard eller annan godkänd
Auth-administration. Operatören ska utanför bootstrapdata:

1. Verifiera personens identitet och e-post.
2. Skapa användaren med ett starkt, unikt lösenord.
3. Bekräfta att self-signup och anonymous sign-in är avstängda.
4. Hämta Auth-userns UUID.
5. Sätta samma UUID som server-secret `CONTROL_CENTER_OWNER_USER_ID`.
6. Köra bootstrap.
7. Låta owner registrera TOTP och verifiera AAL2.

E-post lagras inte i `control_center_owner`. Efter godkänd verifiering måste:

```text
environment owner UUID = database owner UUID = authenticated owner UUID
```

D3 failar stängt vid saknat/ogiltigt environment, Auth-mismatch, otillräcklig
MFA eller annan DB-status än `ok`.

## Lokal runbook

Förutsättningar: Docker Desktop är igång, repositoryts Supabase-stack är
startad och Auth-usern finns.

```powershell
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test

$env:CONTROL_CENTER_OWNER_USER_ID = "<verifierat-lokalt-auth-user-uuid>"
$env:CONTROL_CENTER_BOOTSTRAP_TARGET = "local"

npm run owner:bootstrap:local
npm run owner:verify:local
npm run owner:bootstrap:local
```

Sista kommandot ska ge `already_bootstrapped`. Starta därefter appen med samma
`CONTROL_CENTER_OWNER_USER_ID`, logga in, registrera/verifiera TOTP och öppna
`/tenants`. En annan syntetisk authenticated user ska nekas.

`/auth/mfa/enroll` ska direkt visa Supabase-genererad QR-kod, manuell
setup-nyckel och verifieringsform. Refresh före verifiering ersätter den
overifierade faktorn kontrollerat och visar en ny QR/secret. Efter korrekt
sexsiffrig kod ska sessionen nå AAL2 innan redirect till `/tenants`.

Kör inte reset efter bootstrap om den lokala ownerraden ska behållas; reset
återställer avsiktligt databasen till tom bootstrapstatus.

## Staging och production

Local-only CLI vägrar andra targets. I staging/production ska en godkänd
DB-administratör:

1. Godkänna change record och verifiera targetprojekt/environment.
2. Verifiera backup/checkpoint och aktuell migrationsversion.
3. Skapa/verifiera Auth-usern och signupinställningarna.
4. Sätta `CONTROL_CENTER_OWNER_USER_ID` i hostingens secret manager.
5. Etablera kortlivade standardiserade `PG*`-credentials för `postgres`.
6. Köra följande från en kontrollerad adminarbetsstation:

```powershell
$ownerId = $env:CONTROL_CENTER_OWNER_USER_ID
if ($ownerId -notmatch '^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$') {
  throw "Ogiltigt owner-ID."
}

"select private.bootstrap_control_center_owner('$ownerId'::uuid);" |
  psql --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align

"select private.get_control_center_owner_bootstrap_status('$ownerId'::uuid);" |
  psql --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align
```

7. Ta bort de kortlivade DB-credentials.
8. Starta/redeploya appen med server-secreten.
9. Verifiera ownerlogin, TOTP/AAL2, `/tenants` och negativ non-owner-åtkomst.
10. Dokumentera endast kategoriska resultat.

Inga lokala defaults, projektidentifierare, owner-ID:n eller credentials får
återanvändas i production.

## Audit och change record

F1 skapar inte ett nytt owner-auditramverk. Varje körning måste ha en godkänd
extern change record med environment, tidpunkt, ansvarig operatör, verifierade
kontrollsteg, kategoriskt resultat, positiva/negativa test och slutligt beslut.

Change record får inte innehålla fullständigt UUID, e-post, lösenord, token,
databas-URL, nyckel eller rått databasfel.

## Incident, rollback och recovery

Automatisk owner-switch är förbjuden. `owner_mismatch` gör ingen ändring.

Om fel owner har bootstrappats ska Tenant Management stängas och alla berörda
sessioner återkallas. Korrigering kräver en separat godkänd incident- och
change-process med identitetsverifiering, backup/checkpoint och privilegierad
DB-admin. Environment och DB ska uppdateras som en sammanhållen operation och
D2/D3 samt positiva/negativa åtkomsttest ska köras om.

Ownerraden får inte tas bort som normal rollback eftersom FK, equality och
operativ åtkomst då failar stängt. Recovery får inte byggas in i F1:s
bootstrapfunktion.

## Förbjudna vägar

- Ingen bootstrap över HTTP, route, Server Action, UI eller browser.
- Ingen automatisk ”första Auth-user blir owner”.
- Ingen owner discovery via e-post eller listordning.
- Ingen takeover, owner-switch eller overwrite.
- Ingen verklig owneridentitet i migration, seed, exempel eller Git.
- Ingen permanent Service Role- eller admincredential i applikationen.
- Ingen RLS-, FORCE RLS-, policy- eller signupförsvagning.
- Ingen skapad Auth-user, invitefunktion eller generell användaradministration.
