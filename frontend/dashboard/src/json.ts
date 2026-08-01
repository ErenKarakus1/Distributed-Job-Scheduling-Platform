export function parseOptionalJson<T>(value: string, label: string): T | undefined {
  if (!value.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}
