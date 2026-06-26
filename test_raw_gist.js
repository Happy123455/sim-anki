import fs from 'fs';
const pat = process.env.GITHUB_PAT;
if (!pat) {
  console.log("No pat provided, skipping test");
  process.exit(0);
}
async function test() {
  const res = await fetch("https://api.github.com/gists", {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      public: false,
      files: { "test.txt": { content: "hello world" } }
    })
  });
  const data = await res.json();
  const rawUrl = data.files["test.txt"].raw_url;
  console.log("Raw URL:", rawUrl);

  console.log("Fetching without PAT...");
  const resNoAuth = await fetch(rawUrl);
  console.log("Status without PAT:", resNoAuth.status, await resNoAuth.text());

  // delete
  await fetch(`https://api.github.com/gists/${data.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${pat}` }
  });
}
test().catch(console.error);
