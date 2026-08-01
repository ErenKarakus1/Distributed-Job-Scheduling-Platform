import { CronExpressionParser } from "cron-parser";

export function nextCronRun(cronExpression: string, timezone: string, from: Date) {
  return CronExpressionParser.parse(cronExpression, {
    currentDate: from,
    tz: timezone,
  })
    .next()
    .toDate();
}
