/**
 * Utility for syncing SimAnki data via GitHub Gists using a Personal Access Token (PAT).
 */

/**
 * Deep-sanitize a token string to remove invisible Unicode characters
 * that mobile browsers/keyboards/clipboard managers commonly inject.
 * This includes: zero-width spaces, BOM, non-breaking spaces, soft hyphens,
 * directional marks, carriage returns, newlines, and other control characters.
 */
export function sanitizeToken(raw) {
  if (!raw) return '';
  return String(raw)
    // Remove all Unicode control chars, zero-width chars, BOM, directional marks, etc.
    .replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\uFFF0-\uFFFF]/g, '')
    // Remove non-breaking spaces (common on iOS)
    .replace(/\u00A0/g, '')
    // Collapse any remaining whitespace and trim
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Robustly extracts the Gist ID from a full Gist URL or raw text input.
 * Handles patterns like:
 * - https://gist.github.com/username/gist_id
 * - https://gist.github.com/username/gist_id#file-simanki_backup-json
 * - https://gist.github.com/gist_id
 * - gist_id
 */
export function sanitizeGistId(raw) {
  if (!raw) return '';
  let cleaned = String(raw).trim();
  
  if (cleaned.includes('/')) {
    // Separate out hash fragments and query strings
    cleaned = cleaned.split('#')[0].split('?')[0];
    
    // Split by slashes and find the last non-empty segment
    const parts = cleaned.split('/').filter(Boolean);
    if (parts.length > 0) {
      cleaned = parts[parts.length - 1];
    }
  } else {
    cleaned = cleaned.split('#')[0].split('?')[0];
  }
  
  return sanitizeToken(cleaned);
}

export async function pushToGist(pat, gistId, payload) {
  const cleanPat = sanitizeToken(pat);
  if (!cleanPat) {
    throw new Error("GitHub Personal Access Token (PAT) is required.");
  }
  
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${cleanPat}`,
    'Content-Type': 'application/json'
  };

  const body = {
    description: "SimAnki Spaced Repetition Backup",
    files: {
      "simanki_backup.json": {
        content: JSON.stringify(payload, null, 2)
      }
    }
  };

  const cleanGistId = sanitizeGistId(gistId);

  if (cleanGistId) {
    // Update existing Gist
    const res = await fetch(`https://api.github.com/gists/${cleanGistId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to update Gist (${res.status}): ${errText || res.statusText}`);
    }
    
    const data = await res.json();
    return data.id;
  } else {
    // Create new Secret Gist
    body.public = false;
    const res = await fetch(`https://api.github.com/gists`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to create Gist (${res.status}): ${errText || res.statusText}`);
    }
    
    const data = await res.json();
    return data.id;
  }
}

export async function pullFromGist(pat, gistId) {
  const cleanGistId = sanitizeGistId(gistId);
  if (!cleanGistId) {
    throw new Error("Gist ID (Sync Code) is required.");
  }
  
  const headers = {
    'Accept': 'application/vnd.github+json'
  };
  
  const cleanPat = sanitizeToken(pat);
  if (cleanPat) {
    headers['Authorization'] = `Bearer ${cleanPat}`;
  }

  const res = await fetch(`https://api.github.com/gists/${cleanGistId}`, {
    method: 'GET',
    headers
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to fetch Gist (${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  const file = data.files["simanki_backup.json"];
  if (!file) {
    throw new Error("The specified Gist does not contain a 'simanki_backup.json' file.");
  }
  
  // GitHub truncates large gist files — if truncated, fetch from raw_url
  let content = file.content;
  if (file.truncated && file.raw_url) {
    const rawRes = await fetch(file.raw_url);
    if (!rawRes.ok) {
      throw new Error(`Failed to fetch full Gist content (${rawRes.status})`);
    }
    content = await rawRes.text();
  }
  
  if (!content) {
    throw new Error("Gist file content is empty.");
  }
  
  return JSON.parse(content);
}
