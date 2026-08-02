function formatNumber(value: string) {
  return value.padStart(2, "0");
}

function formatList(values: string[], formatter = (value: string) => value) {
  if (values.length === 1) {
    return formatter(values[0] ?? "");
  }

  const formatted = values.map(formatter);
  return `${formatted.slice(0, -1).join(", ")} and ${formatted.at(-1)}`;
}

function describeMinute(minute: string) {
  if (minute === "*") {
    return undefined;
  }

  if (/^\*\/\d+$/.test(minute)) {
    return `Every ${minute.slice(2)} minutes`;
  }

  if (/^\d+$/.test(minute)) {
    return `At minute ${formatNumber(minute)}`;
  }

  return undefined;
}

function describeDayOfWeek(dayOfWeek: string) {
  const dayNames: Record<string, string> = {
    "0": "Sunday",
    "1": "Monday",
    "2": "Tuesday",
    "3": "Wednesday",
    "4": "Thursday",
    "5": "Friday",
    "6": "Saturday",
    "7": "Sunday",
  };

  if (dayOfWeek === "*") {
    return undefined;
  }

  if (/^\d+(,\d+)*$/.test(dayOfWeek)) {
    return ` on ${formatList(dayOfWeek.split(","), (value) => dayNames[value] ?? value)}`;
  }

  return ` when day-of-week matches ${dayOfWeek}`;
}

export function humanizeCronExpression(expression: string) {
  const parts = expression.trim().split(/\s+/);

  if (parts.length !== 5) {
    return "Enter a five-part cron expression";
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return "Enter a five-part cron expression";
  }

  if (
    minute === "*" &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return "Every minute";
  }

  if (
    /^\*\/\d+$/.test(minute) &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `Every ${minute.slice(2)} minutes`;
  }

  if (
    minute === "0" &&
    /^\*\/\d+$/.test(hour) &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `Every ${hour.slice(2)} hours`;
  }

  if (
    /^\d+$/.test(minute) &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `${describeMinute(minute)} every hour`;
  }

  if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) {
    const time = `${formatNumber(hour)}:${formatNumber(minute)}`;
    const dayText = describeDayOfWeek(dayOfWeek) ?? "";

    if (dayOfMonth === "*" && month === "*") {
      return `Every day at ${time}${dayText}`;
    }

    if (/^\d+$/.test(dayOfMonth) && month === "*") {
      return `Every month on day ${dayOfMonth} at ${time}${dayText}`;
    }

    if (dayOfMonth === "*" && /^\d+$/.test(month)) {
      return `Every day in month ${month} at ${time}${dayText}`;
    }

    return `At ${time} when date matches ${dayOfMonth} ${month} ${dayOfWeek}`;
  }

  return `Advanced schedule: ${expression.trim()}`;
}
