import "server-only";

import type {
  InstallationAdministrativeStatus,
  InstallationEnvironment,
} from "./installation.types";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Stockholm",
});

export function formatInstallationDateTime(value: string): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}

export function installationEnvironmentLabel(
  environment: InstallationEnvironment,
): string {
  switch (environment) {
    case "production":
      return "Produktion";
    case "staging":
      return "Staging";
    case "test":
      return "Test";
    case "development":
      return "Utveckling";
  }
}

export function installationStatusLabel(
  status: InstallationAdministrativeStatus,
): string {
  switch (status) {
    case "planned":
      return "Planerad";
    case "active":
      return "Aktiv";
    case "paused":
      return "Pausad";
    case "decommissioned":
      return "Avvecklad";
  }
}

export function installationValueOrMissing(value: string | null): string {
  return value ?? "Saknas";
}
