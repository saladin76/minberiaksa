import type { Prisma } from "@prisma/client";
// The Mongo connector accepts literal JSON null; SQL null sentinels do not apply.
export const jsonValue = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
