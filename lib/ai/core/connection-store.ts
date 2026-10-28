import "server-only";
import { prisma } from "../../prisma";
import { rawCommand } from "../../prisma-raw-command";
import { createAiConnectionStore } from "./connection-store-core";

export const aiConnectionStore = createAiConnectionStore(command => prisma.$runCommandRaw(rawCommand(command)));
