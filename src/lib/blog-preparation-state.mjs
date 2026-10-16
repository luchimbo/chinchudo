export function preparationPhase(value) {
  return value && typeof value === "object" && ["GENERATING", "REVIEWING"].includes(value.phase) ? value.phase : "WAITING";
}
