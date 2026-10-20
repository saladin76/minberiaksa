import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Delegate, Store } from "./service";
function adapter(client: PrismaClient | Prisma.TransactionClient): Store {
  return {
    model(name) {
      const delegate = (client as unknown as Record<string, unknown>)[name];
      if (!delegate) throw new Error("Content model unavailable");
      return delegate as Delegate;
    },
    transaction: (fn) =>
      "$transaction" in client
        ? client.$transaction((tx) => fn(adapter(tx)), {
            maxWait: 10000,
            timeout: 30000,
          })
        : fn(adapter(client)),
  };
}
export const contentStore = adapter(prisma);
