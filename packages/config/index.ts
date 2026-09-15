import 'dotenv/config';
import { z } from 'zod';
import {validateBrowserEndpoint} from '../validation/endpoints.js';
const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().default(18402),
  HOST: z.string().default('127.0.0.1'),
  APP_ORIGIN: z.url().default('http://localhost:18400'),
  DATABASE_URL: z.string().min(1), REDIS_URL: z.string().min(1),
  S3_ENDPOINT: z.url(), S3_PUBLIC_ENDPOINT: z.url(),
  S3_METRICS_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('us-east-1'), S3_BUCKET: z.string().default('astrafile'),
  S3_ACCESS_KEY: z.string().min(12), S3_SECRET_KEY: z.string().min(24),
  COOKIE_SECRET: z.string().min(32), BOOTSTRAP_TOKEN_HASH: z.string().length(64),
  STORAGE_DISK_PATH: z.string(),
  SMTP_URL: z.string().optional(), MAIL_FROM: z.string().default('AstraFile <noreply@localhost>'),
  TRUST_PROXY: z.string().default('127.0.0.1,::1'),
  SCAN_COMMAND: z.string().optional(),
});
export const env = schema.parse(process.env);
export const production = env.NODE_ENV === 'production';
validateBrowserEndpoint(env.APP_ORIGIN, env.S3_PUBLIC_ENDPOINT);
if (production && !env.APP_ORIGIN.startsWith('https://')) throw new Error('Production requires an HTTPS APP_ORIGIN. Use project-owned TLS on a high port when no domain is available.');
export const MiB = 1024 ** 2;
export const GiB = 1024 ** 3;
const quota = z.object({fileBytes: z.number().int().min(1).max(5 * 1024 ** 4), storageBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), dailyBytes: z.number().int().positive(), monthlyBytes: z.number().int().positive(), bandwidthBytes: z.number().int().positive()});
export const settingsSchema = z.object({
  siteName: z.string().min(1).max(60).default('AstraFile'),
  description: z.string().max(200).default('A little space for your biggest ideas.'),
  supportUrl: z.union([z.literal(''), z.url()]).default(''),
  defaultLanguage: z.enum(['en','ar']).default('en'),
  logoFileId: z.uuid().nullable().default(null), faviconFileId: z.uuid().nullable().default(null),
  homepageTitle: z.string().max(120).default(''), homepageSubtitle: z.string().max(300).default(''),
  defaultTheme: z.enum(['dark','light','system']).default('dark'),
  sharePasswordsEnabled: z.boolean().default(true), anonymousSharingEnabled: z.boolean().default(true),
  defaultMaxDownloads: z.number().int().min(1).max(1000000).nullable().default(null),
  anonymousEnabled: z.boolean().default(true), registrationEnabled: z.boolean().default(true),
  maintenance: z.boolean().default(false), readOnly: z.boolean().default(false),
  partMiB: z.union([z.literal(32),z.literal(64),z.literal(128),z.literal(256)]).default(64),
  concurrency: z.number().int().min(1).max(8).default(4),
  uploadTimeoutHours: z.number().int().min(1).max(720).default(72),
  anonymousRetentionDays: z.number().int().min(1).max(365).default(7),
  defaultShareHours: z.number().int().min(0).max(87600).default(168),
  versioningEnabled: z.boolean().default(true),
  maxVersionCount: z.number().int().min(0).max(1000).default(20),
  maxVersionDays: z.number().int().min(0).max(3650).default(90),
  trashDays: z.number().int().min(1).max(365).default(30),
  sessionDays: z.number().int().min(1).max(90).default(30),
  requireManualActivation: z.boolean().default(true),
  maxSessions: z.number().int().min(1).max(100).default(20),
  privacyRetentionDays: z.number().int().min(1).max(90).default(7),
  anonymousConcurrentUploads: z.number().int().min(1).max(10).default(2),
  incompleteUploadLimit: z.number().int().min(1).max(100).default(8),
  incompleteReservedGiB: z.number().min(1).max(100000).default(2000),
  uploadCreatesPerMinute: z.number().int().min(1).max(1000).default(10),
  uploadCreatesPerHour: z.number().int().min(1).max(10000).default(60),
  failedUploadThreshold: z.number().int().min(1).max(1000).default(10),
  uploadCooldownMinutes: z.number().int().min(1).max(1440).default(15),
  criticalFreeGiB: z.number().min(1).max(100000).default(15),
  minimumFreeGiB: z.number().min(1).max(100000).default(10),
  warningFreeGiB: z.number().min(1).max(100000).default(20),
  apiPerMinute: z.number().int().min(30).max(10000).default(600),
  anonymousCreatesPerHour: z.number().int().min(1).max(10000).default(30),
  blockedExtensions: z.array(z.string().regex(/^[a-z0-9]{1,15}$/)).max(100).default([]),
  accent: z.enum(['teal','blue','violet']).default('teal'),
  scanningEnabled: z.boolean().default(false),
  quotas: z.record(z.enum(['GUEST','USER','SUPPORT','MODERATOR','ADMIN','OWNER']), quota).default({
    GUEST: {fileBytes:100*GiB,storageBytes:100*GiB,dailyBytes:100*GiB,monthlyBytes:300*GiB,bandwidthBytes:500*GiB},
    USER: {fileBytes:200*GiB,storageBytes:500*GiB,dailyBytes:500*GiB,monthlyBytes:2000*GiB,bandwidthBytes:5000*GiB},
    SUPPORT: {fileBytes:200*GiB,storageBytes:500*GiB,dailyBytes:500*GiB,monthlyBytes:2000*GiB,bandwidthBytes:5000*GiB},
    MODERATOR: {fileBytes:200*GiB,storageBytes:500*GiB,dailyBytes:500*GiB,monthlyBytes:2000*GiB,bandwidthBytes:5000*GiB},
    ADMIN: {fileBytes:500*GiB,storageBytes:2000*GiB,dailyBytes:2000*GiB,monthlyBytes:10000*GiB,bandwidthBytes:20000*GiB},
    OWNER: {fileBytes:500*GiB,storageBytes:2000*GiB,dailyBytes:2000*GiB,monthlyBytes:10000*GiB,bandwidthBytes:20000*GiB}
  })
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings = settingsSchema.parse({});
