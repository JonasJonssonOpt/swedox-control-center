import "server-only";

import {
  PROVISIONING_RESULT_FIELDS,
  ProvisioningProviderError,
  type ManualProvisioningStepProvider,
  type ProvisioningResultField,
  type ProvisioningRunbook,
  type ProvisioningStepKey,
  type ProvisioningStepResults,
} from "./provider.types";

// Same formats as the database constraints on provisioning_runs.result_*.
const PROJECT_REF_PATTERN = /^[a-z0-9]{1,64}$/;
const REGION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const URL_PATTERN =
  /^https:\/\/[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::[0-9]{1,5})?(?:[/?][^#\s]*)?$/;

const FIELD_MESSAGES: Readonly<Record<ProvisioningResultField, string>> =
  Object.freeze({
    applicationUrl:
      "Ange appens fullständiga HTTPS-adress utan inloggningsuppgifter eller fragment.",
    hostingRegion: "Ange regionen med gemener, till exempel eu-north-1.",
    supabaseProjectRef:
      "Ange projektets referens (Project ref) med gemener och siffror.",
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function present(value: unknown): boolean {
  return !(value === undefined || value === null || value === "");
}

function validField(field: ProvisioningResultField, value: string): boolean {
  switch (field) {
    case "supabaseProjectRef":
      return PROJECT_REF_PATTERN.test(value);
    case "hostingRegion":
      return value.length <= 64 && REGION_PATTERN.test(value);
    case "applicationUrl": {
      if (value.length < 9 || value.length > 2048 || !URL_PATTERN.test(value))
        return false;
      try {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          url.username === "" &&
          url.password === "" &&
          url.hash === ""
        );
      } catch {
        return false;
      }
    }
  }
}

// Accepts exactly the fields the step owns: trimmed, required and valid.
// Any other result field, or an unknown key, is rejected.
function normalizerFor(
  owned: readonly ProvisioningResultField[],
): (input: unknown) => ProvisioningStepResults {
  return (input) => {
    if (input === undefined || input === null) input = {};
    if (!isRecord(input)) {
      throw new ProvisioningProviderError("form", "Ogiltigt resultat.");
    }
    for (const key of Object.keys(input)) {
      const field = PROVISIONING_RESULT_FIELDS.find((name) => name === key);
      if (!field) {
        throw new ProvisioningProviderError("form", "Okänt resultatfält.");
      }
      if (!owned.includes(field) && present(input[key])) {
        throw new ProvisioningProviderError(
          field,
          "Det här steget registrerar inte detta värde.",
        );
      }
    }
    const results: Record<ProvisioningResultField, string | null> = {
      applicationUrl: null,
      hostingRegion: null,
      supabaseProjectRef: null,
    };
    for (const field of owned) {
      const raw = input[field];
      const value = typeof raw === "string" ? raw.trim() : raw;
      if (
        typeof value !== "string" ||
        value === "" ||
        !validField(field, value)
      ) {
        throw new ProvisioningProviderError(field, FIELD_MESSAGES[field]);
      }
      results[field] = value;
    }
    return Object.freeze(results);
  };
}

const RUNBOOKS: Readonly<Record<ProvisioningStepKey, ProvisioningRunbook>> =
  Object.freeze({
    supabase_project: {
      instructions: [
        "Skapa ett nytt Supabase-projekt för installationen i SweDox AB:s Supabase-organisation.",
        "Välj region eu-north-1 (Stockholm) om inget annat är avtalat med kunden.",
        "Spara projektets lösenord och nycklar i SweDox AB:s lösenordshanterare, aldrig i Control Center.",
        "Registrera projektets referens (Project ref) och region här.",
      ],
      resultFields: ["supabaseProjectRef", "hostingRegion"],
      summary: "Kundens egen databas, Auth och lagring.",
      title: "Skapa Supabase-projekt",
    },
    database_schema: {
      instructions: [
        "Kör SweDox-migrationerna från SweDox-repot mot det nya projektet.",
        "Kontrollera att alla migrationer applicerades utan fel.",
      ],
      resultFields: [],
      summary: "SweDox databasschema i kundens projekt.",
      title: "Kör SweDox-migrationer",
    },
    application_deployment: {
      instructions: [
        "Driftsätt SweDox-appen för kunden med miljövariabler mot kundens Supabase-projekt.",
        "Lägg in nycklar endast i hostingens skyddade miljövariabler, aldrig i Control Center.",
        "Registrera appens fullständiga HTTPS-adress här.",
      ],
      resultFields: ["applicationUrl"],
      summary: "Kundens körande SweDox-app.",
      title: "Deploya SweDox-app",
    },
    initial_administrator: {
      instructions: [
        "Skapa kundens första administratör i kundens SweDox med rollen admin.",
        "Skicka inbjudan till administratörens e-postadress så att hen själv sätter sitt lösenord.",
        "Registrera aldrig lösenord eller inbjudningslänkar i Control Center.",
      ],
      resultFields: [],
      summary: "Kundens ansvarige får tillgång till sitt system.",
      title: "Skapa första administratör och skicka inbjudan",
    },
    installation_verification: {
      instructions: [
        "Öppna appens adress och kontrollera att SweDox svarar.",
        "Kontrollera att administratören har accepterat inbjudan och kan logga in.",
        "Detta intygar provisioneringen vid detta tillfälle. Löpande hälsa visas av Monitoring.",
      ],
      resultFields: [],
      summary: "Intyg att installationen fungerar vid provisioneringen.",
      title: "Verifiera installation",
    },
  });

export function createManualStepProvider(
  stepKey: ProvisioningStepKey,
  position: number,
): ManualProvisioningStepProvider {
  const source = RUNBOOKS[stepKey];
  const runbook: ProvisioningRunbook = Object.freeze({
    instructions: Object.freeze([...source.instructions]),
    resultFields: Object.freeze([...source.resultFields]),
    summary: source.summary,
    title: source.title,
  });
  return Object.freeze({
    kind: "manual" as const,
    normalizeResults: normalizerFor(runbook.resultFields),
    position,
    runbook,
    stepKey,
  });
}
