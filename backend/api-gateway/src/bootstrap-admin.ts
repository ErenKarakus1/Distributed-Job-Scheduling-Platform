import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "./auth.js";

const bootstrapAdminSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  name: z.string().min(1).max(120).default("Platform Admin"),
  password: z.string().min(8).max(200),
});

export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;

export function parseBootstrapAdminInput(env: NodeJS.ProcessEnv): BootstrapAdminInput {
  return bootstrapAdminSchema.parse({
    email: env.ADMIN_EMAIL,
    name: env.ADMIN_NAME || undefined,
    password: env.ADMIN_PASSWORD,
  });
}

async function bootstrapAdmin() {
  const prisma = new PrismaClient();
  const input = parseBootstrapAdminInput(process.env);

  try {
    const user = await prisma.user.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        role: "ADMIN",
      },
      update: {
        name: input.name,
        passwordHash: await hashPassword(input.password),
        role: "ADMIN",
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    console.log(`Bootstrapped admin user ${user.email} (${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("bootstrap-admin.ts") || process.argv[1]?.endsWith("bootstrap-admin.js")) {
  bootstrapAdmin().catch((error) => {
    if (error instanceof z.ZodError) {
      console.error("Invalid admin bootstrap input", error.issues);
      process.exit(1);
    }

    console.error("Admin bootstrap failed", error);
    process.exit(1);
  });
}
