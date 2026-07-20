export const managedPropertiesOptions = [
  {
    value: "starting_now",
    label: "Sto iniziando ora",
    countValue: 0,
  },
  {
    value: "one_to_three",
    label: "Gestisco da 1 a 3 immobili",
    countValue: 3,
  },
  {
    value: "four_to_ten",
    label: "Gestisco da 4 a 10 immobili",
    countValue: 10,
  },
  {
    value: "more_than_ten",
    label: "Gestisco piu di 10 immobili",
    countValue: 11,
  },
] as const;

export type ManagedPropertiesRange = (typeof managedPropertiesOptions)[number]["value"];

export const managedPropertiesLabels = Object.fromEntries(
  managedPropertiesOptions.map((option) => [option.value, option.label]),
) as Record<ManagedPropertiesRange, string>;

export function getManagedPropertiesCount(value: string) {
  return managedPropertiesOptions.find((option) => option.value === value)?.countValue ?? null;
}

export function getManagedPropertiesLabel(value: string | null | undefined, count?: number | null) {
  if (value && value in managedPropertiesLabels) {
    return managedPropertiesLabels[value as ManagedPropertiesRange];
  }

  if (count === 0) return "Sto iniziando ora";
  if (count && count <= 3) return "Gestisco da 1 a 3 immobili";
  if (count && count <= 10) return "Gestisco da 4 a 10 immobili";
  if (count && count > 10) return "Gestisco piu di 10 immobili";

  return "Non indicato";
}
