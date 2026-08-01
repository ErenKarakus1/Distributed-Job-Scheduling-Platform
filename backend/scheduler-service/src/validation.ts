import { z } from "zod";

export const scheduleRunSchema = z.object({
  now: z.coerce.date().optional(),
});
