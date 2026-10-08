import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, { error: 'DATABASE_URL is required' }),
  JWT_ACCESS_SECRET: z.string().min(32, { error: 'JWT_ACCESS_SECRET must be at least 32 characters' }),
  JWT_REFRESH_SECRET: z.string().min(32, { error: 'JWT_REFRESH_SECRET must be at least 32 characters' }),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:3600'),
  /** Public URL of the web app, used to build invite links. */
  WEB_APP_URL: z.url().default('https://splitease-lalit.vercel.app'),
  PORT: z.coerce.number().int().default(4600),
  /** Opt-in escape hatch to allow schema introspection in production. */
  ALLOW_INTROSPECTION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Max connections per serverless instance / local process. */
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  cached = parsed.data;
  return cached;
}

/** Tests flip NODE_ENV and need the next getEnv() call to re-read process.env. */
export function resetEnvCache() {
  cached = undefined;
}

export const isProduction = () => getEnv().NODE_ENV === 'production';
