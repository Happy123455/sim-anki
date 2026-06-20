/**
 * Utility for syncing SimAnki data via GitHub Gists using a Personal Access Token (PAT).
 */

export async function pushToGist(pat, gistId, payload) {
  const cleanPat = String(pat || '').trim();
  if (!cleanPat) {
    throw new Error("GitHub Personal Access Token (PAT) is required.");
  }
  
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${cleanPat}`,
    'X-GitHub-Api-Version': '2022-11-28',
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

  if (gistId) {
    // Update existing Gist
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
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
  if (!gistId) {
    throw new Error("Gist ID (Sync Code) is required.");
  }
  
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  
  const cleanPat = String(pat || '').trim();
  if (cleanPat) {
    headers['Authorization'] = `Bearer ${cleanPat}`;
  }

  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
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
    const rawRes = await fetch(file.raw_url, {
      headers: cleanPat ? { 'Authorization': `Bearer ${cleanPat}` } : {}
    });
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
