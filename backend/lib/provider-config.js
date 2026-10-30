import { DEFAULT_OVERPASS_URL } from '@vorka/shared/osm';

// Public repository URL verified from this project's configured Git remote.
const PROJECT_URL = 'https://github.com/Pimentelzxc/LEAD-HUNTER';

export function overpassEndpoint(env = process.env) {
  const endpoint = new URL(env.OVERPASS_API_URL || DEFAULT_OVERPASS_URL);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('INVALID_OVERPASS_URL');
  return endpoint;
}

export function overpassHeaders(env = process.env) {
  let appUrl = PROJECT_URL;
  try {
    const configured = new URL(env.APP_URL);
    if (['https:','http:'].includes(configured.protocol) && !configured.username && !configured.password) {
      configured.search = ''; configured.hash = '';
      // Preserve a project/repository path; origin alone can lose its identity.
      appUrl = configured.href;
    }
  } catch { /* A local project still has its public repository identifier. */ }
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
    'User-Agent': `VORKA-Lead-Hunter/1.1 (+${appUrl})`,
  };
}
