/** Writes schema.graphql (consumed by the mobile app's GraphQL Code Generator). */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { lexicographicSortSchema, printSchema } from 'graphql';

process.env.DATABASE_URL ??= 'postgresql://unused';
process.env.JWT_ACCESS_SECRET ??= 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET ??= 'x'.repeat(32);

const { schema } = await import('../src/schema/index.js');
const target = fileURLToPath(new URL('../schema.graphql', import.meta.url));
writeFileSync(target, `${printSchema(lexicographicSortSchema(schema))}\n`);
console.log(`Wrote ${target}`);
