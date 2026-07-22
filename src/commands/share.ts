import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output } from '../output.js';

// connect style apply-all triggers server-side AI generation (30-120s)
const TIMEOUT_STYLE = 600_000;

export function registerShareCommand(parent: Command): void {
  const share = parent.command('share').description('Share & publish management — set command is naturally idempotent (safe to re-run)');

  share
    .command('publish')
    .description('Publish the form for public access (each respondent can submit once; unlimited respondents; stays open until unpublished). Auto-applies visual style if not yet styled.')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      // ── Connect style fallback: check if form has been styled ──
      const queryResult = await execCommand(`assess connect query --app ${opts.app} --json`);
      let needsStyle = true;
      if (queryResult.code === 0 && queryResult.data) {
        try {
          const query = JSON.parse(queryResult.data);
          if (query.styled === true) needsStyle = false;
        } catch {}
      }
      if (needsStyle) {
        console.log('🎨 No visual style detected. Auto-applying default style...');
        const styleResult = await execCommand(
          `assess connect style apply-all --app ${opts.app} --theme minimalist --look "professional assessment form, clean modern design, clear typography, subtle color palette" --json`,
          undefined,
          TIMEOUT_STYLE,
        );
        if (styleResult.code === 0) {
          console.log('✅ Visual style applied successfully.');
        } else {
          console.log(`⚠️ Style auto-apply skipped: ${styleResult.message}`);
        }
      }

      // ── Publish the form ──
      const cmd = `assess share set --app ${opts.app} --form-type all --form-perm 1 --form-day 3650000 --json`;
      const result = await execCommand(cmd);
      output(result);
      // After publishing, fetch and display all 3 URLs
      if (result.code === 0) {
        const urlsResult = await execCommand(`assess app urls --app ${opts.app} --json`);
        if (urlsResult.code === 0 && urlsResult.data) {
          try {
            const urls = JSON.parse(urlsResult.data);
            console.log('');
            console.log('📋 App URLs:');
            if (urls.shareUrl) console.log(`   Fill-in URL: ${urls.shareUrl}`);
            if (urls.builderUrl) console.log(`   Editor URL:  ${urls.builderUrl}`);
            if (urls.dataUrl) console.log(`   Data URL:    ${urls.dataUrl}`);
          } catch {}
        }
      }
    });

  share
    .command('unpublish')
    .description('Unpublish the app')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const cmd = `assess share set --app ${opts.app} --form-type no --json`;
      const result = await execCommand(cmd);
      output(result);
    });

  share
    .command('query')
    .description('Query publish status')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const cmd = `assess share query --app ${opts.app} --json`;
      const result = await execCommand(cmd);
      output(result);
    });

  share
    .command('url')
    .description('Get all app URLs (fill-in, editor, data management)')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      // Use app urls to return all 3 URLs (fill-in, editor, data) in one call
      const cmd = `assess app urls --app ${opts.app} --json`;
      const result = await execCommand(cmd);
      output(result);
    });
}
