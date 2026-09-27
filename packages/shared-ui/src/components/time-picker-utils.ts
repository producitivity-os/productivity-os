export type TimePickerType = "minutes" | "seconds" | "hours" | "12hours";
export type Period = "AM" | "PM";

const validNumber = (value: string, min: number, max: number, loop = false) => {
  let numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) numeric = min;
  if (loop) {
    if (numeric > max) numeric = min;
    if (numeric < min) numeric = max;
  } else numeric = Math.min(max, Math.max(min, numeric));
  return String(numeric).padStart(2, "0");
};

export const getValidHour = (value: string) => validNumber(value, 0, 23);
export const getValid12Hour = (value: string) => validNumber(value, 1, 12);
export const getValidMinuteOrSecond = (value: string) => validNumber(value, 0, 59);
export const getValidArrowHour = (value: string, step: number) => validNumber(String(Number.parseInt(value, 10) + step), 0, 23, true);
export const getValidArrow12Hour = (value: string, step: number) => validNumber(String(Number.parseInt(value, 10) + step), 1, 12, true);
export const getValidArrowMinuteOrSecond = (value: string, step: number) => validNumber(String(Number.parseInt(value, 10) + step), 0, 59, true);

export function convert12HourTo24Hour(hour: number, period: Period) {
  if (period === "PM" && hour <= 11) return hour + 12;
  if (period === "AM" && hour === 12) return 0;
  return hour;
}

export function setDateByType(date: Date, value: string, type: TimePickerType, period?: Period) {
  if (type === "minutes") date.setMinutes(Number(getValidMinuteOrSecond(value)));
  else if (type === "seconds") date.setSeconds(Number(getValidMinuteOrSecond(value)));
  else if (type === "hours") date.setHours(Number(getValidHour(value)));
  else if (period) date.setHours(convert12HourTo24Hour(Number(getValid12Hour(value)), period));
  return date;
}

export function getDateByType(date: Date, type: TimePickerType) {
  if (type === "minutes") return getValidMinuteOrSecond(String(date.getMinutes()));
  if (type === "seconds") return getValidMinuteOrSecond(String(date.getSeconds()));
  if (type === "hours") return getValidHour(String(date.getHours()));
  const hour = date.getHours() % 12 || 12;
  return getValid12Hour(String(hour));
}

export function getArrowByType(value: string, step: number, type: TimePickerType) {
  if (type === "minutes" || type === "seconds") return getValidArrowMinuteOrSecond(value, step);
  if (type === "hours") return getValidArrowHour(value, step);
  return getValidArrow12Hour(value, step);
}
