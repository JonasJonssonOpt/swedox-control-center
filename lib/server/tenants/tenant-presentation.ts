import "server-only";

import type { TenantCategory, TenantOperationalStatus } from "./tenant.types";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Stockholm",
});

export function formatTenantDateTime(value: string): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}

export function formatOrganizationNumber(value: string | null): string {
  if (value === null) {
    return "Saknas";
  }

  return value.replace(/^(\d{6})(\d{4})$/, "$1-$2");
}

export function tenantCategoryLabel(category: TenantCategory): string {
  switch (category) {
    case "customer":
      return "Kund";
    case "pilot":
      return "Pilot";
    case "internal":
      return "Intern";
  }
}

export function tenantStatusLabel(status: TenantOperationalStatus): string {
  switch (status) {
    case "active":
      return "Aktiv";
    case "paused":
      return "Pausad";
  }
}

export function valueOrMissing(value: string | null): string {
  return value ?? "Saknas";
}
