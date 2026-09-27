import type { NutritionWaterDay } from "@productivity-os/workflow-plugin-sdk";

export const DEFAULT_WATER_INCREMENT_MILLILITERS = 100;

export type WaterData = NutritionWaterDay & Record<string, unknown> & {
  incrementMilliliters: number;
};

export function createWaterData(localDate: string): WaterData {
  return {
    localDate,
    targetMilliliters: 2_000,
    intakeMilliliters: 0,
    incrementMilliliters: DEFAULT_WATER_INCREMENT_MILLILITERS,
    updatedAt: 0,
  };
}

export function migrateWaterData(data: Record<string, unknown>, localDate: string): WaterData {
  const increment = Number(data.incrementMilliliters);
  return {
    ...createWaterData(localDate),
    ...data,
    incrementMilliliters: Number.isInteger(increment)
      ? Math.max(1, Math.min(2_000, increment))
      : DEFAULT_WATER_INCREMENT_MILLILITERS,
  } as WaterData;
}

export function nextWaterIntake(current: number, delta: number): number {
  return Math.max(0, current + delta);
}

export function formatWaterAmount(milliliters: number): string {
  if (milliliters >= 1_000 && milliliters % 1_000 === 0) return `${milliliters / 1_000} L`;
  return `${milliliters} ml`;
}

export function formatWaterProgress(data: Pick<WaterData, "intakeMilliliters" | "targetMilliliters">): string {
  if (data.intakeMilliliters >= data.targetMilliliters)
    return `${formatWaterAmount(data.targetMilliliters)} goal reached`;
  return `${formatWaterAmount(data.intakeMilliliters)} of ${formatWaterAmount(data.targetMilliliters)}`;
}
