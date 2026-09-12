# SweDox Control Center – Roadmap till färdig 1.0

> Införd från projektägarens styrande plan 2026-09-12. Denna roadmap styr
> 1.0-scope och leveransordning framför den äldre fasindelningen i
> [Control Center Roadmap](CONTROL_CENTER_ROADMAP.md). Detaljerade beslutade
> domänkontrakt gäller fortsatt; eventuella konflikter hanteras i respektive
> analys-/beslutssteg. Slutstatusar under framtida steg är exitkrav, inte
> redan uppnådda verifieringsresultat. Evidens och releasekontroller finns i
> [Modulstatus](MODULE_STATUS.md) och [Launch 1.0](Launch_1_0.md).

Detta dokument är den styrande utvecklingsroadmapen för SweDox Control Center från nuvarande läge tills Control Center 1.0 är färdigt, verifierat och stängt.

## 1. Övergripande mål

Control Center ska bli ett separat administrativt system för SweDox med säkra, tydligt avgränsade domäner för:

Owner/Auth/MFA

Tenant Management

Installation Management

Licensing

Provisioning

Monitoring / Alerts

Dashboard

Slutlig Control Center 1.0-verifiering

När Control Center 1.0 är klar ska alla domäner ha tydliga kontrakt, privilegierad åtkomst vara server-side, MFA/AAL2 gälla enligt säkerhetsmodellen, RLS/FORCE RLS vara verifierat, inga privilegierade browser-writes finnas, inga Service Role-genvägar användas i appen, mutationsflöden vara atomiska, audit finnas där domänen kräver det, optimistic concurrency användas där det behövs, listor använda deterministisk sortering och keyset-pagination där relevant, UI följa Control Centers standard, hela systemet vara verifierat och dokumentationen vara uppdaterad.

## 2. Obligatoriskt arbetssätt

Alla större funktioner och moduler ska följa:

Analysis

Architecture / Decision Lock

Implementation Plan

Small Implementation

Automated Verification

Runtime Verification

Documentation

Commit / Push

Module Closure

Ingen större funktion ska implementeras direkt utan analys och plan.

Codex ska:

läsa repositoryt före ändring

återanvända befintliga kontrakt

undvika duplicerad domänlogik

inte ändra stängda domäner indirekt

inte utöka scope utan uttryckligt beslut

stoppa vid blockerare i stället för att gissa

tydligt skilja fakta från antaganden

## 3. Globala tekniska regler

Stack:

Next.js 16 App Router

TypeScript

Supabase SSR

PostgreSQL

Supabase CLI

pgTAP

Windows / PowerShell

AWS eu-north-1 där relevant

Säkerhetsmodell:

Verified Owner + MFA/AAL2
→ Server Component / Server Action / Route
→ Domain Service
→ Repository
→ Supabase SSR
→ RLS / RPC
→ Atomic DB mutation
→ Audit

Regler:

ingen Service Role i app-runtime

ingen browser Supabase för privilegierade operationer

requireOwnerIntegrity()/full owner guard används enligt kontrakt

DB-AAL2 används i de domäner där det beslutats

RLS/FORCE RLS ska verifieras

direct writes ska nekas

RPC ska vara smala och domänspecifika

SECURITY DEFINER kräver låst search_path

auth.uid() ska bindas i DB för actor där det krävs

råa DB-fel får inte exponeras i UI

Next.js control-flow errors ska bevaras

secrets ska hållas utanför domänmodeller där de inte hör hemma

## 4. Stängda domäner

Owner / Auth / MFA / AAL2

Status: KLAR

Tenant Management

Status: KLAR / STÄNGD

Installation Management

Status: KLAR / STÄNGD

Stängda domäner får inte ändras funktionellt utan nytt analyserat change-step.

## 5. Nuvarande status

Licensing

F2D1 Domain and Security Contract – KLAR

F2D1B Decision Lock – KLAR

F2D2 Database Foundation – IMPLEMENTERAD OCH LOKALT VERIFIERAD

F2D2 omfattar:

licenses

license_terms_versions

license_audit_events

constraints

deferred referential integrity

partial uniqueness

RLS + FORCE RLS

inga policies

inga API-grants

foundation pgTAP

genererade DB-typer

dokumentation

Nästa steg:

F2D4 – Licensing Audit / Terms History Integrity.

F2D3 är implementerad och lokalt verifierad 2026-09-12: kombinerad owner+AAL2
SELECT på licenses/terms, audit utan direkt åtkomst och samtliga writes stängda.
Full regression: 1 323 pgTAP och 162 Node-test. Se
[F2D3-verifieringen](LICENSE_OWNER_AAL2_VERIFICATION.md). Signerad Data API-runtime
och cloud återstår; Licensing är inte komplett. Stegordningen nedan bevaras.

## 6. Licensing – återstående roadmap

### F2D3 – Owner Read / Security / DB-AAL2

Mål:

Licensing-specifik DB-AAL2 helper

owner + AAL2 enforcement

SELECT-policies för relevanta Licensing-tabeller

direkta writes fortsatt nekade

negativa säkerhetstester

AAL1 deny

non-owner + AAL2 deny

unauthenticated deny

malformed/missing AAL deny

owner + AAL2 allow

ingen ändring av shared owner helper

ingen ändring av Tenant/Installation

Exit:

DB-AAL2 verifierad

RLS-policies verifierade

access matrix verifierad

inga writes öppnade

full regression grön

### F2D4 – Audit + Terms History Integrity

Mål:

immutable license_terms_versions

immutable license_audit_events

append-only enforcement

skydd mot UPDATE/DELETE

revisionskedjeinvarianter

relation mellan license revision, audit revision och terms revision

DB-tests

inga produktmutationer ännu

Exit:

terms och audit kan inte ändras historiskt

revisionsintegritet fail-closed

full regression grön

### F2D5 – Licensing Mutations

Kan delas i F2D5A/B/C.

Mutationer:

create license

activate

suspend

reactivate

terminate

change plan / technical terms

renew

Regler:

expected revision

row lock

stale conflict

ingen overwrite

ingen auto-retry

no-op = ingen revision/audit

varje lyckad mutation atomisk

revision +1

audit

terms version endast när terms ändras

rättighetsökning kräver active non-archived tenant

suspend/terminate får ske även om tenant paused/archived

terminated är terminal

ingen fysisk delete

Concurrency:

parallella create

parallell update

parallel terminate/create

stale revision

rollback vid audit/terms failure

Exit:

samtliga mutationsflöden verifierade

atomicity och concurrency verifierad

full regression grön

### F2D6 – Read Model / Pagination / Provisioning Eligibility

License list:

tenant

plan

admin status

derived validity

max active users

valid until / tills vidare

updated time

Filters:

tenant

status

validity

terminated visibility

begränsad sökning

Pagination:

deterministic ordering

keyset pagination

ingen offset

cursor bundet till filter

Derived validity:

not_started

valid

expired

Provisioning eligibility:

eligible

missing_license

draft

suspended

terminated

not_started

expired

tenant_unavailable

tenant_installation_mismatch

technical_read_error

Eligibility ska vara derived, inte lagrad.

### F2D7 – Licensing Server DAL / Service Layer

server-only repository

domain service

validation

DTO/mappers

error mapping

no-store där relevant

server-side owner guard

read contracts

mutation contracts

audit read

eligibility

ingen browser Supabase

### F2D8 – Licensing UI

Routes:

/licenses

/licenses/[licenseId]

Listvy:

Tenant

Plan

Administrativ status

Giltighet

Max aktiverade användarkonton

Giltig till / Tills vidare

Senast uppdaterad

Detaljvy:

tenant

lifecycle

current terms

validity

terms history

audit history

revision

metadata

Actions:

create

activate

suspend

reactivate

terminate

renew

terms change

UI-regler:

inga badges

status som text

samma Control Center-designspråk

kompakt administrativ layout

Saknas för nullable data

Tills vidare för null valid_until

inga råa fel

begriplig stale-data-feedback

### F2D9 – Licensing Security Pass / Runtime Verification / Closure

Verifiera:

Owner/AAL2

DB-AAL2

RLS/FORCE

grants

direct access denial

mutationer

concurrency

audit

terms history

lifecycle

validity

renewal

pagination

eligibility

manual runtime

full regression

docs

cloud runtime där relevant

Slutstatus:
Licensing:

Tekniskt komplett: Ja

Manuellt runtimeverifierat: Ja

Verksamhetsklart: Ja

Säkerhetsverifierat: Ja

Låst/stängt: Ja

## 7. Provisioning – roadmap

Provisioning startar efter stängd Licensing-domän.

Provisioning får konsumera:

Tenant publicerade read contracts

Installation publicerade read contracts

Licensing eligibility contract

Provisioning får inte:

skriva Tenant

skriva Installation utanför publicerat kontrakt

skriva Licensing

duplicera licensing eligibility

tolka Installation active som provisioned/healthy

### F2E1 – Provisioning Domain Analysis

Lås:

ansvar

ownership

state machine

jobmodell

retrymodell

provider boundary

idempotency

secret boundary

relation till Installation

relation till Licensing

relation till Monitoring

auditbehov

concurrency

failover/retry semantics

### F2E2 – Provisioning Decision Lock / Implementation Plan

Lås:

tabeller

statusar

error model

job attempts

idempotency keys

resource references

secret references

provider abstraction

manual retry

cancel

reconciliation

audit

### F2E3 – Provisioning Database Foundation

provisioning records/jobs

attempts

status

immutable installation relation

constraints

RLS/FORCE

grants

tester

typer

fail-closed

### F2E4 – Provisioning Security / Owner Read

owner/AAL2

RLS read

read contracts

negative tests

### F2E5 – Provisioning Mutations / State Machine

request provisioning

start

success

fail

retry

cancel där relevant

expected revision

atomic audit

idempotency

### F2E6 – Provider Integration Layer

server-only provider abstraction

stabil adapter

inga secrets i vanlig domäntabell

ingen direkt UI-providerkoppling

### F2E7 – Reconciliation / Retry / Failure Handling

reconciliation

stale jobs

retry policy

terminal failures

manual operator retry

recoverability

audit

### F2E8 – Provisioning DAL / API / Server Actions

repository

service

DTO

routes/actions

error mapping

no browser privileged access

### F2E9 – Provisioning UI

Minst:

provisioning status

senaste försök

felorsak

retry

start

historik

tenant/installation relation

### F2E10 – Provisioning Runtime / Security Closure

Verifiera:

licensing re-check vid faktisk start

installation relation

retries

concurrency

idempotency

failure modes

audit

owner/AAL2

full regression

cloud runtime

Slutstatus:
Provisioning:

Tekniskt komplett: Ja

Manuellt runtimeverifierat: Ja

Verksamhetsklart: Ja

Säkerhetsverifierat: Ja

Låst/stängt: Ja

## 8. Monitoring / Alerts – roadmap

Monitoring får läsa publicerade contracts från Tenant, Installation, Licensing och Provisioning, men ska inte mutera dessa domäner.

### F2F1 – Monitoring Domain Analysis

Lås:

health model

signal sources

alert severity

open/resolved lifecycle

deduplication

acknowledgement

suppression

retention

polling/event ingestion

ownership

dashboard boundary

### F2F2 – Monitoring Decision Lock / DB Plan

Lås:

monitor targets

observations

alerts

alert events

uniqueness

retention

status

severity

timestamps

indexes

pagination

audit

### F2F3 – Monitoring Database Foundation

schema

RLS/FORCE

grants

constraints

pgTAP

generated types

### F2F4 – Monitoring Read / Security

owner/AAL2

read contracts

list/filter

keyset pagination

negative tests

### F2F5 – Observation / Alert Processing

ingest observations

derive alert

dedupe

resolve

reopen

severity

concurrency

idempotency

### F2F6 – Alert Actions

acknowledge

resolve/manual action om tillåtet

suppress om kontraktet tillåter

expected revision

audit

### F2F7 – Monitoring Server Layer / UI

UI minst:

active alerts

severity

tenant

installation

source

first seen

last seen

acknowledgement

history

### F2F8 – Monitoring Runtime / Security Closure

Verifiera:

alert generation

dedupe

resolve/reopen

concurrency

security

pagination

runtime

full regression

Slutstatus:
Monitoring:

Tekniskt komplett: Ja

Manuellt runtimeverifierat: Ja

Verksamhetsklart: Ja

Säkerhetsverifierat: Ja

Låst/stängt: Ja

## 9. Dashboard – roadmap

Dashboard byggs sist av de operativa huvuddomänerna och ska konsumera publicerade domain reads/services.

### F2G1 – Dashboard Metrics Contract

Lås exakta definitioner för minst:

Aktiva kunder

Aktiva licenser

Provisioneringar som kräver åtgärd

Aktiva varningar

Varje mått ska ha:

exakt definition

source domain

time semantics

exclusion rules

error/fail-closed behavior

### F2G2 – Dashboard Read Services

Implementera minimala sammanfattningsreads från:

Tenant

Licensing

Provisioning

Monitoring

Dashboard får inte duplicera domänlogik.

### F2G3 – Dashboard UI

sammanfattningskort/sektioner

loading/error

timestamps/evaluatedAt där relevant

inga vilseledande defaultvärden vid read error

### F2G4 – Dashboard Runtime Verification

Verifiera:

korrekta counts

real data

error behavior

reload

owner/AAL2

ingen cross-domain leakage

full regression

## 10. Control Center 1.0 – final closure

### F2H1 – Full Security Review

Granska:

auth

owner integrity

MFA/AAL2

DB-AAL2 där relevant

RLS

FORCE RLS

grants

SECURITY DEFINER

search_path

auth.uid actor binding

direct browser access

Service Role usage

secret handling

raw error leakage

cross-domain writes

stale update protection

Klassificera fynd:

BLOCKER

MUST FIX

BACKLOG

ACCEPTED RISK

### F2H2 – Full Regression / Clean Reset

Kör från ren lokal DB:

alla migrationer

DB lint

alla pgTAP

alla Node tests

TypeScript

Prettier

ESLint

Next production build

route inventory

generated DB types

git diff --check

### F2H3 – Full Runtime Verification

Verifiera:
Auth:

login

MFA

logout

reload

session

Tenant:

publicerade huvudflöden

Installation:

publicerade huvudflöden

Licensing:

create

lifecycle

renewal

conflict

list

history

Provisioning:

request

progress

success

fail

retry

reconciliation

Monitoring:

observation

alert

acknowledgement

resolve/reopen

Dashboard:

metrics

errors

refresh

### F2H4 – Cloud Verification

På befintligt SweDox Control Center-projekt.

Ingen tredje Supabase-miljö.

Verifiera:

migrationsstatus

runtime auth

RLS

MFA/AAL2

relevanta mutationsflöden

integrationer

secrets/config

cloud-specific differences

### F2H5 – Documentation Closure

Uppdatera slutligt:

docs/MODULE_STATUS.md

docs/CONTROL_CENTER_ROADMAP.md

docs/PROJECT_DECISIONS.md

docs/SECURITY_STANDARD.md

docs/UI_STANDARD.md

docs/Launch_1_0.md

docs/CHANGELOG.md

domändokument för Tenant, Installation, Licensing, Provisioning, Monitoring och Dashboard

Dokumentationen ska skilja mellan:

implementerat

automatiskt verifierat

runtimeverifierat

cloud-verifierat

backlog

### F2H6 – Control Center 1.0 Closure

Control Center får endast markeras färdigt när:

Owner/Auth/MFA CLOSED
Tenant Management CLOSED
Installation CLOSED
Licensing CLOSED
Provisioning CLOSED
Monitoring CLOSED
Dashboard CLOSED
Security Pass PASSED
Full Regression PASSED
Runtime Verification PASSED
Cloud Verification PASSED
Documentation CLOSED

Slutklassificering:
CONTROL CENTER 1.0: COMPLETE

## 11. Backlog som inte blockerar 1.0 om inget nytt beslut säger annat

advanced audit export

långsiktig audit retention automation

avancerad backup automation

kommersiellt Billing-system

payment provider integration

usage-based billing

per-module licensing

avancerad entitlement engine

multi-owner

granular RBAC utöver beslutad 1.0-modell

avancerad metrics/BI

avancerad incident management

automatiserad cross-region disaster recovery

självserviceportal för kund

full plan/package admin UI

## 12. Codex – obligatoriskt beteende vid varje steg

När Codex får en prompt som refererar till denna roadmap ska Codex:

Identifiera aktuellt steg.

Läsa relevanta docs och repository truth.

Bekräfta dependencies.

Hålla sig strikt inom scope.

Inte ändra stängda domäner.

Inte skapa nya affärsregler utan explicit beslut.

Implementera minimalt.

Köra full relevant regression.

Redovisa alla ändrade filer.

Redovisa explicit vad som INTE implementerats.

Uppdatera docs när steget är verifierat.

Ge PowerShell git-kommandon men inte committa/pusha om det inte uttryckligen efterfrågas.

## 13. Planerad ordning från nu

F2D3 Licensing Owner Read / DB-AAL2
F2D4 Licensing Audit / Terms Integrity
F2D5 Licensing Mutations
F2D6 Licensing Read / Pagination / Eligibility
F2D7 Licensing Server DAL
F2D8 Licensing UI
F2D9 Licensing Security + Runtime Closure

F2E1 Provisioning Analysis
F2E2 Provisioning Decision Lock / Plan
F2E3 Provisioning Database Foundation
F2E4 Provisioning Security / Read
F2E5 Provisioning Mutations / State Machine
F2E6 Provisioning Provider Integration
F2E7 Provisioning Reconciliation / Retry
F2E8 Provisioning DAL / API
F2E9 Provisioning UI
F2E10 Provisioning Closure

F2F1 Monitoring Analysis
F2F2 Monitoring Decision Lock / Plan
F2F3 Monitoring Database Foundation
F2F4 Monitoring Security / Read
F2F5 Observation / Alert Processing
F2F6 Alert Actions
F2F7 Monitoring Server Layer / UI
F2F8 Monitoring Closure

F2G1 Dashboard Metrics Contract
F2G2 Dashboard Read Services
F2G3 Dashboard UI
F2G4 Dashboard Runtime Verification

F2H1 Full Security Review
F2H2 Full Clean Regression
F2H3 Full Runtime Verification
F2H4 Cloud Verification
F2H5 Documentation Closure
F2H6 Control Center 1.0 Closure

## 14. Slutmål

När denna roadmap är genomförd ska nästa fokus vara:

Återgå till SweDox huvudsystem.

Control Center ska då betraktas som en separat, stabil administrativ produkt där framtida funktionella ändringar endast görs genom kontrollerade change-steps.
