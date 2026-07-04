const { execSync } = require('child_process');
const path = require('path');

const pat = process.argv[2] || process.env.GITHUB_PAT || '';
const repo = 'Happy123455/sim-anki';

async function deploy() {
  console.log('📦 Building Vite project...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
  } catch (e) {
    console.error('❌ Build failed:', e.message);
    process.exit(1);
  }

  if (pat) {
    console.log('🧹 Checking and clearing GitHub deployment conflicts...');
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/deployments`, {
        headers: { 'Authorization': `Bearer ${pat}` }
      });
      const deployments = await res.json();
      if (Array.isArray(deployments)) {
        // Delete older inactive or conflict deployments to clear the Pages compilation queue
        for (const dep of deployments) {
          const age = Date.now() - new Date(dep.created_at).getTime();
          if (age < 48 * 60 * 60 * 1000) { // Limit to deployments from the last 48 hours
            console.log(`🗑️ Deleting deployment: ${dep.id} (${dep.created_at})`);
            await fetch(`https://api.github.com/repos/${repo}/deployments/${dep.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${pat}` }
            });
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Warning: Could not auto-clear deployments:', e.message);
    }
  }

  console.log('🚀 Pushing built files to gh-pages branch...');
  const distDir = path.join(__dirname, '..', 'dist');
  
  try {
    // Run git operations inside dist folder
    execSync('git init', { cwd: distDir, stdio: 'ignore' });
    execSync('git add -A', { cwd: distDir });
    try {
      execSync(`git commit --allow-empty -m "Deploy: ${new Date().toISOString()}"`, { cwd: distDir, stdio: 'ignore' });
    } catch (e) {
      // Catch error
    }
    
    // Setup remote and force push
    try {
      execSync(`git remote add origin https://github.com/${repo}.git`, { cwd: distDir, stdio: 'ignore' });
    } catch (e) {
      // Remote might already exist
      execSync(`git remote set-url origin https://github.com/${repo}.git`, { cwd: distDir, stdio: 'ignore' });
    }
    
    console.log('📤 Force pushing to gh-pages...');
    execSync(`git push origin head:gh-pages --force`, { cwd: distDir, stdio: 'inherit' });
    
    console.log('✨ Deployment pushed successfully in one shot!');
  } catch (e) {
    console.error('❌ Push failed:', e.message);
    process.exit(1);
  }
}

deploy();
