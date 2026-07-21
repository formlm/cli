import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface Profile {
  name: string;
  url: string;
  token: string;
  active?: boolean;
}

export interface Config {
  profiles: Profile[];
}

const CONFIG_DIR = path.join(os.homedir(), '.formlm');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): Config {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { profiles: [] };
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as Config;
  } catch {
    return { profiles: [] };
  }
}

export function saveConfig(config: Config): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function getActiveProfile(): Profile | null {
  const config = loadConfig();
  return config.profiles.find(p => p.active) || config.profiles[0] || null;
}

export function getProfile(name?: string): Profile | null {
  if (!name) return getActiveProfile();
  const config = loadConfig();
  return config.profiles.find(p => p.name === name) || null;
}

export function getBaseUrl(): string {
  return process.env.FORMLM_BASE_URL || getProfile(runtimeProfile)?.url || getActiveProfile()?.url || 'https://formlm.me';
}

export function getToken(profileName?: string): string {
  return process.env.FORMLM_TOKEN || getProfile(profileName || runtimeProfile)?.token || getActiveProfile()?.token || '';
}

// Runtime profile override (set by --profile global option)
let runtimeProfile: string | undefined;
export function setRuntimeProfile(name: string): void {
  runtimeProfile = name;
}

export function addProfile(profile: Profile): void {
  const config = loadConfig();
  const existing = config.profiles.findIndex(p => p.name === profile.name);
  if (existing >= 0) {
    config.profiles[existing] = profile;
  } else {
    config.profiles.push(profile);
  }
  // Auto-set first profile as active
  if (config.profiles.length === 1) {
    config.profiles[0].active = true;
  }
  saveConfig(config);
}

export function setActiveProfile(name: string): boolean {
  const config = loadConfig();
  let found = false;
  for (const p of config.profiles) {
    p.active = p.name === name;
    if (p.name === name) found = true;
  }
  if (found) saveConfig(config);
  return found;
}

export function removeProfile(name: string): boolean {
  const config = loadConfig();
  const before = config.profiles.length;
  config.profiles = config.profiles.filter(p => p.name !== name);
  if (config.profiles.length < before) {
    if (config.profiles.length > 0 && !config.profiles.some(p => p.active)) {
      config.profiles[0].active = true;
    }
    saveConfig(config);
    return true;
  }
  return false;
}
