import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output, localFail, isJsonMode } from '../output.js';
import { escapeArg, normBool } from '../utils.js';

// Server-side expert theme registry (ExpertTheme.findThemeByName) — validate locally
// so a bad value fails fast with the valid list instead of a server round-trip error.
const EXPERT_THEMES = ['Minimal', 'Fresh', 'Vibrant', 'Retro', 'Earthy', 'Soft', 'Clean', 'Noir', 'Warm', 'Classic', 'Airy', 'Mystic'];

// Server-side expert set whitelist (ExpertCommand.applyExpertProperty)
const EXPERT_SET_PROPERTIES = ['name', 'role', 'description', 'style', 'welcome', 'prompt', 'question1', 'question2', 'question3', 'kbText', 'enable', 'enableWelcome', 'theme'];

function validateTheme(theme: string): void {
  if (!EXPERT_THEMES.some(t => t.toLowerCase() === theme.toLowerCase())) {
    localFail(`Invalid --theme "${theme}". Valid themes: ${EXPERT_THEMES.join(', ')} (case-insensitive).`);
  }
}

export function registerExpertCommand(parent: Command): void {
  const expert = parent.command('expert').description('AI expert agent configuration (chatbot on final page)');

  // ========== Query & Find ==========

  expert
    .command('query')
    .description('Query expert agent config (use --md for token-efficient markdown)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--md', 'Markdown table output (for AI)')
    .option('--human', 'Humanized display')
    .option('--filter <keyword>', 'Keyword filter (matches name/role/style/description)')
    .action(async (opts) => {
      let cmd = `assess expert query --app ${opts.app}`;
      if (opts.md) cmd += ' --md';
      if (opts.human) cmd += ' --human';
      if (opts.filter) cmd += ` --filter "${escapeArg(opts.filter)}"`;
      if (!opts.md && !opts.human) cmd += ' --json';
      output(await execCommand(cmd));
    });

  expert
    .command('find')
    .description('Get expert agent full config (including prompt/welcome/questions full text)')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const cmd = `assess expert find --app ${opts.app} --json`;
      output(await execCommand(cmd));
    });

  // ========== Config (Full Setup) ==========

  expert
    .command('config')
    .description('Configure expert agent (full setup). Use this for initial configuration or bulk updates. For single-property changes, use "expert set". Note: passing this command creates/enables the agent by default; --enable false keeps/updating the config but leaves the agent disabled. If the app has no expert yet, this command is the entry point (no separate "ensure" needed).')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--name <name>', 'Agent display name (server marks it required — omitting it fails with Missing required option)')
    .option('--role <role>', 'Agent role (e.g. "心理健康顾问" or "Career Coach")')
    .option('--description <desc>', 'Agent description')
    .option('--style <style>', 'Communication style (e.g. "warm and professional" or "亲切专业")')
    .option('--prompt <prompt>', 'Custom system prompt (role + knowledge boundary + communication style + behavior rules)')
    .option('--welcome <text>', 'Welcome message shown when chat opens')
    .option('--question1 <text>', 'Quick-start question 1')
    .option('--question2 <text>', 'Quick-start question 2')
    .option('--question3 <text>', 'Quick-start question 3')
    .option('--theme <theme>', `UI theme — one of: ${EXPERT_THEMES.join('/')}`)
    .option('--enable [value]', 'Enable agent (true/false, default: true). Forwarded space-separated (--enable true) per server picocli arity 0..1')
    .requiredOption('--kbText <text>', 'Knowledge base text (required, max 500 chars, domain knowledge for this expert)')
    .action(async (opts) => {
      // Historically this flag was forwarded as `--enable=true`, which the server
      // rejected as an unknown option and the whole config silently did nothing.
      // The server now declares --enable with arity 0..1 — send the space-separated form.
      const enable = normBool(opts.enable);
      if (opts.theme) validateTheme(opts.theme);
      let cmd = `assess expert config --app ${opts.app}`;
      cmd += ` --name "${escapeArg(opts.name)}"`;
      if (opts.role) cmd += ` --role "${escapeArg(opts.role)}"`;
      if (opts.description) cmd += ` --description "${escapeArg(opts.description)}"`;
      if (opts.style) cmd += ` --style "${escapeArg(opts.style)}"`;
      if (opts.prompt) cmd += ` --prompt "${escapeArg(opts.prompt)}"`;
      if (opts.welcome) cmd += ` --welcome "${escapeArg(opts.welcome)}"`;
      if (opts.question1) cmd += ` --question1 "${escapeArg(opts.question1)}"`;
      if (opts.question2) cmd += ` --question2 "${escapeArg(opts.question2)}"`;
      if (opts.question3) cmd += ` --question3 "${escapeArg(opts.question3)}"`;
      if (opts.theme) cmd += ` --theme ${opts.theme}`;
      if (enable !== undefined) cmd += ` --enable ${enable}`;
      cmd += ` --kbText "${escapeArg(opts.kbText)}"`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
      if (result.code === 0 && enable === false && !isJsonMode()) {
        console.log('ℹ️  Expert configured but left DISABLED (--enable false). Enable later with: formlm-cli expert set --app ' + opts.app + ' --property enable --value true');
      }
    });

  // ========== Set (Single Property) ==========

  expert
    .command('set')
    .description(`Set a single property on the expert agent. Valid --property values: ${EXPERT_SET_PROPERTIES.join('/')}. Tip: to only toggle the agent use --property enable --value true|false (no need for full expert config).`)
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--property <property>', `Property path: ${EXPERT_SET_PROPERTIES.join('/')}`)
    .requiredOption('--value <value>', 'New value')
    .action(async (opts) => {
      if (!EXPERT_SET_PROPERTIES.includes(opts.property)) {
        localFail(`Invalid --property "${opts.property}". Valid: ${EXPERT_SET_PROPERTIES.join(', ')}. (Older docs said --key; the server option is --property.)`);
      }
      if (opts.property === 'theme') validateTheme(opts.value);
      const cmd = `assess expert set --app ${opts.app} --property ${opts.property} --value "${escapeArg(opts.value)}" --json`;
      output(await execCommand(cmd));
    });

  // ========== Avatar ==========

  expert
    .command('avatar')
    .description('Set expert agent avatar image (requires expert config first — the agent entity must exist)')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--url <url>', 'Avatar image URL')
    .option('--enable [value]', 'Enable avatar display (true/false, default: false)')
    .action(async (opts) => {
      const e = normBool(opts.enable) === true;
      // Server picocli declares --enable with arity 0..1: send the space-separated form,
      // never `--enable=true` equals-concatenation.
      let cmd = `assess expert avatar --app ${opts.app} --url "${escapeArg(opts.url)}" --enable ${e} --json`;
      output(await execCommand(cmd));
    });

  // ========== Remove ==========

  expert
    .command('remove')
    .description('Remove/reset expert agent configuration (can be reconfigured with "expert config")')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const cmd = `assess expert remove --app ${opts.app} --json`;
      output(await execCommand(cmd));
    });

  // ========== Chat (Test) ==========

  expert
    .command('chat')
    .description('Send a test message to the expert agent and get a response')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--input <text>', 'Message to send')
    .action(async (opts) => {
      const cmd = `assess expert chat --app ${opts.app} --input "${escapeArg(opts.input)}"`;
      output(await execCommand(cmd));
    });
}
