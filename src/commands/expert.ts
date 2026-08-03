import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output } from '../output.js';
import { escapeArg } from '../utils.js';

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
    .description('Configure expert agent (full setup). Use this for initial configuration or bulk updates. For single-property changes, use "expert set"')
    .requiredOption('--app <appId>', 'App ID')
    .option('--name <name>', 'Agent display name')
    .option('--role <role>', 'Agent role (e.g. "心理健康顾问" or "Career Coach")')
    .option('--description <desc>', 'Agent description')
    .option('--style <style>', 'Communication style (e.g. "warm and professional" or "亲切专业")')
    .option('--prompt <prompt>', 'Custom system prompt (role + knowledge boundary + communication style + behavior rules)')
    .option('--welcome <text>', 'Welcome message shown when chat opens')
    .option('--question1 <text>', 'Quick-start question 1')
    .option('--question2 <text>', 'Quick-start question 2')
    .option('--question3 <text>', 'Quick-start question 3')
    .option('--theme <theme>', 'UI theme: Minimal/Fresh/Vibrant/Retro/Earthy/Soft/Clean/Noir/Warm/Classic/Airy/Mystic')
    .option('--enable [value]', 'Enable agent (true/false, default: true)')
    .requiredOption('--kbText <text>', 'Knowledge base text (required, max 500 chars, domain knowledge for this expert)')
    .action(async (opts) => {
      let cmd = `assess expert config --app ${opts.app}`;
      if (opts.name) cmd += ` --name "${escapeArg(opts.name)}"`;
      if (opts.role) cmd += ` --role "${escapeArg(opts.role)}"`;
      if (opts.description) cmd += ` --description "${escapeArg(opts.description)}"`;
      if (opts.style) cmd += ` --style "${escapeArg(opts.style)}"`;
      if (opts.prompt) cmd += ` --prompt "${escapeArg(opts.prompt)}"`;
      if (opts.welcome) cmd += ` --welcome "${escapeArg(opts.welcome)}"`;
      if (opts.question1) cmd += ` --question1 "${escapeArg(opts.question1)}"`;
      if (opts.question2) cmd += ` --question2 "${escapeArg(opts.question2)}"`;
      if (opts.question3) cmd += ` --question3 "${escapeArg(opts.question3)}"`;
      if (opts.theme) cmd += ` --theme ${opts.theme}`;
      if (opts.enable !== undefined) cmd += ` --enable=${opts.enable === true || opts.enable === 'true'}`;
      cmd += ` --kbText "${escapeArg(opts.kbText)}"`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  // ========== Set (Single Property) ==========

  expert
    .command('set')
    .description('Set a single property on the expert agent (use "expert find" to see all available fields)')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--property <property>', 'Property path: name/role/description/style/welcome/prompt/question1/question2/question3/kbText/theme/enable')
    .requiredOption('--value <value>', 'New value')
    .action(async (opts) => {
      const cmd = `assess expert set --app ${opts.app} --property ${opts.property} --value "${escapeArg(opts.value)}" --json`;
      output(await execCommand(cmd));
    });

  // ========== Avatar ==========

  expert
    .command('avatar')
    .description('Set expert agent avatar image')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--url <url>', 'Avatar image URL')
    .option('--enable [value]', 'Enable avatar display (true/false, default: false)')
    .action(async (opts) => {
      let cmd = `assess expert avatar --app ${opts.app} --url "${escapeArg(opts.url)}"`;
      const e = opts.enable === true || opts.enable === 'true';
      cmd += ` --enable=${e}`;
      cmd += ' --json';
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
