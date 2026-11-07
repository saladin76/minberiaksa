import { createRequire } from 'node:module';
import { mkdir, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { cleanRetiredCategory } from './retired-category-cleanup-service.mjs';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--apply' && !/^--expected-projects=\d+$/.test(arg)) || args.filter(arg => arg === '--apply').length > 1 || args.filter(arg => arg.startsWith('--expected-projects=')).length !== 1) {
  console.error('Usage: node scripts/cleanup-retired-sadaqah.mjs --expected-projects=127 [--apply]'); process.exit(2);
}
const require = createRequire(resolve('package.json'));
require('@next/env').loadEnvConfig(process.cwd(), false);
const { PrismaClient } = require('@prisma/client'), db = new PrismaClient();
try {
  const report = await cleanRetiredCategory(db, { apply: args.includes('--apply'), expectedProjects: Number(args.find(arg => arg.startsWith('--expected-projects=')).split('=')[1]),
    saveBackup: async snapshot => {
      const directory = resolve(process.env.MINBERI_CATEGORY_BACKUP_DIR || '../minberi-category-backups');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const path = join(directory, `sadaqah-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      const handle = await open(path, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(snapshot, null, 2)); await handle.sync(); } finally { await handle.close(); }
      return path;
    },
  });
  console.log(JSON.stringify(report, null, 2));
} catch (error) { console.error(error instanceof Error ? error.message : 'CATEGORY_CLEANUP_FAILED'); process.exitCode = 1; }
finally { await db.$disconnect(); }
