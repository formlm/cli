import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output } from '../output.js';
import { escapeArg, normBool } from '../utils.js';

// ── Timeouts ──────────────────────────────────────────────────────────────────
// connect style apply/apply-all triggers server-side AI style generation (30-120s),
// so they need a longer timeout than regular CLI commands.
const TIMEOUT_DEFAULT = 60_000;   // 60s for query/find/set/move (non-AI commands)
const TIMEOUT_STYLE   = 600_000;  // 10min for style apply/apply-all (AI-generated styles)

export function registerConnectCommand(parent: Command): void {
  const connect = parent.command('connect').description('Page styling & visual customization — P0: --theme must be one of 6 design modes (scenic/skeuomorphic/liquid/glassmorphism/immersive/minimalist). --look must include scenario + visual style. NEVER use type names (cover/main/final) as --id. Run "formlm-cli skill connect" for full constraints');

  // ========== Connect - Query ==========

  connect
    .command('query')
    .description('List all pages (cover / main / final) with key config')
    .requiredOption('--app <appId>', 'App ID')
    .option('--type <type>', 'Filter by page type: cover / main / final')
    .option('--filter <keyword>', 'Keyword filter (matches id/type/name/format)')
    .option('--md', 'Markdown table output (lower token, for AI)')
    .action(async (opts) => {
      let cmd = `assess connect query --app ${opts.app}`;
      if (opts.type) cmd += ` --type ${opts.type}`;
      if (opts.filter) cmd += ` --filter "${escapeArg(opts.filter)}"`;
      if (opts.md) cmd += ` --md`;
      else cmd += ` --json`;
      const result = await execCommand(cmd);
      output(result);
    });

  connect
    .command('find')
    .description('Find a single page by keyword (returns full details including HTML content)')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--filter <keyword>', 'Keyword to search (matches id/type/name/format)')
    .action(async (opts) => {
      const cmd = `assess connect find --app ${opts.app} --filter "${escapeArg(opts.filter)}" --json`;
      const result = await execCommand(cmd);
      output(result);
    });

  connect
    .command('types')
    .description('List all supported page format types')
    .option('--category <category>', 'Filter by category: cover / main / final')
    .option('--verbose', 'Show descriptions alongside format names')
    .action(async (opts) => {
      let cmd = 'assess connect types';
      if (opts.category) cmd += ` --category ${opts.category}`;
      if (opts.verbose) cmd += ` --verbose`;
      const result = await execCommand(cmd);
      output(result);
    });

  connect
    .command('config')
    .description('Get configurable properties for a specific page format')
    .requiredOption('--category <category>', 'Page category: cover / main / final')
    .requiredOption('--format <format>', 'Page format (e.g. rich-text, text, user-info)')
    .action(async (opts) => {
      const cmd = `assess connect config --category ${opts.category} --format ${opts.format}`;
      const result = await execCommand(cmd);
      output(result);
    });

  // ========== Cover Page ==========

  const coverPage = connect.command('cover-page').description('Cover page management');

  coverPage
    .command('add')
    .description('Add a cover page (or update if page ID already exists)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <pageId>', 'Page ID (recommended for precise reference, e.g. cover_main)')
    .option('--name <name>', 'Page name')
    .option('--format <format>', 'Page format (rich-text/text/user-info)', 'text')
    .option('--layout <layout>', 'Page layout', 'cube')
    .option('--value <html>', 'Top content (rich text HTML)')
    .option('--description <html>', 'Bottom content (rich text HTML)')
    .option('--subtitle <text>', 'Subtitle text')
    .option('--enable-split-screen [value]', 'Enable split-screen display (true/false)')
    .option('--screen-text <html>', 'Split-screen left panel HTML content')
    .option('--enable-head [value]', 'Show title area (true/false, default: true)')
    .option('--enable-title-writer [value]', 'Enable typewriter animation for title (true/false)')
    .option('--logo <logo>', 'Logo icon (Font Awesome class e.g. fa-solid fa-brain, or image URL with /)')
    .option('--enable-logo [value]', 'Show logo (true/false)')
    .action(async (opts) => {
      let cmd = `assess connect cover-page add --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.name) cmd += ` --name "${escapeArg(opts.name)}"`;
      if (opts.format) cmd += ` --format ${opts.format}`;
      if (opts.layout) cmd += ` --layout ${opts.layout}`;
      if (opts.value) cmd += ` --value "${escapeArg(opts.value)}"`;
      if (opts.description) cmd += ` --description "${escapeArg(opts.description)}"`;
      if (opts.subtitle) cmd += ` --subtitle "${escapeArg(opts.subtitle)}"`;
      const ess = normBool(opts.enableSplitScreen);
      if (ess !== undefined) cmd += ` --enable-split-screen=${ess}`;
      if (opts.screenText) cmd += ` --screen-text "${escapeArg(opts.screenText)}"`;
      const eh = normBool(opts.enableHead);
      if (eh !== undefined) cmd += ` --enable-head=${eh}`;
      const etw = normBool(opts.enableTitleWriter);
      if (etw !== undefined) cmd += ` --enable-title-writer=${etw}`;
      if (opts.logo) cmd += ` --logo "${escapeArg(opts.logo)}"`;
      const el = normBool(opts.enableLogo);
      if (el !== undefined) cmd += ` --enable-logo=${el}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  coverPage
    .command('update')
    .description('Update a cover page')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <pageId>', 'Page ID (required when multiple cover pages exist)')
    .option('--name <name>', 'Page name')
    .option('--format <format>', 'Page format (rich-text/text/user-info)')
    .option('--layout <layout>', 'Page layout')
    .option('--value <html>', 'Top content (rich text HTML)')
    .option('--description <html>', 'Bottom content (rich text HTML)')
    .option('--subtitle <text>', 'Subtitle text')
    .option('--enable-split-screen [value]', 'Enable split-screen display (true/false)')
    .option('--screen-text <html>', 'Split-screen left panel HTML content')
    .option('--enable-head [value]', 'Show title area (true/false)')
    .option('--enable-title-writer [value]', 'Enable typewriter animation (true/false)')
    .option('--logo <logo>', 'Logo icon (Font Awesome class or image URL)')
    .option('--enable-logo [value]', 'Show logo (true/false)')
    .option('--logo-size <size>', 'Logo size in px (32~120, default: 68)', parseInt)
    .option('--enable-logo-icon [value]', 'Use preset icon instead of uploaded image (true/false)')
    .action(async (opts) => {
      let cmd = `assess connect cover-page update --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.name) cmd += ` --name "${escapeArg(opts.name)}"`;
      if (opts.format) cmd += ` --format ${opts.format}`;
      if (opts.layout) cmd += ` --layout ${opts.layout}`;
      if (opts.value) cmd += ` --value "${escapeArg(opts.value)}"`;
      if (opts.description) cmd += ` --description "${escapeArg(opts.description)}"`;
      if (opts.subtitle) cmd += ` --subtitle "${escapeArg(opts.subtitle)}"`;
      const ess = normBool(opts.enableSplitScreen);
      if (ess !== undefined) cmd += ` --enable-split-screen=${ess}`;
      if (opts.screenText) cmd += ` --screen-text "${escapeArg(opts.screenText)}"`;
      const eh = normBool(opts.enableHead);
      if (eh !== undefined) cmd += ` --enable-head=${eh}`;
      const etw = normBool(opts.enableTitleWriter);
      if (etw !== undefined) cmd += ` --enable-title-writer=${etw}`;
      if (opts.logo) cmd += ` --logo "${escapeArg(opts.logo)}"`;
      const el = normBool(opts.enableLogo);
      if (el !== undefined) cmd += ` --enable-logo=${el}`;
      if (opts.logoSize !== undefined) cmd += ` --logo-size ${opts.logoSize}`;
      const eli = normBool(opts.enableLogoIcon);
      if (eli !== undefined) cmd += ` --enable-logo-icon=${eli}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  coverPage
    .command('find')
    .description('Get cover page full details (including value/description HTML)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <pageId>', 'Page ID (required when multiple cover pages)')
    .action(async (opts) => {
      let cmd = `assess connect cover-page find --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  coverPage
    .command('set')
    .description('Set a single property on cover page (any field from find output)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <pageId>', 'Page ID (required when multiple cover pages)')
    .requiredOption('--property <property>', 'Property path (e.g. name/value/description/subtitle/enableHead/format/layout)')
    .requiredOption('--value <value>', 'New value')
    .action(async (opts) => {
      let cmd = `assess connect cover-page set --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      cmd += ` --property ${opts.property} --value "${escapeArg(opts.value)}" --json`;
      const result = await execCommand(cmd);
      output(result);
    });

  coverPage
    .command('remove')
    .description('Remove a cover page')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <pageId>', 'Page ID (required when multiple cover pages)')
    .action(async (opts) => {
      let cmd = `assess connect cover-page remove --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  // ========== Final Page ==========

  const finalPage = connect.command('final-page').description('Final page management');

  finalPage
    .command('add')
    .description('Add a final/thank-you page (or update if page ID already exists)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <pageId>', 'Page ID (recommended, e.g. final_report)')
    .option('--name <name>', 'Page name')
    .option('--format <format>', 'Page format (rich-text/url/report-pdf/fill-rank/block-scale/expert/order-pay)', 'rich-text')
    .option('--layout <layout>', 'Page layout', 'cube')
    .option('--value <html>', 'Top content (rich text HTML)')
    .option('--description <html>', 'Bottom content (rich text HTML)')
    .option('--subtitle <text>', 'Subtitle text')
    .option('--enable-split-screen [value]', 'Enable split-screen display (true/false)')
    .option('--enable-head [value]', 'Show title area (true/false, default: true)')
    .option('--enable-title-writer [value]', 'Enable typewriter animation (true/false)')
    .option('--enable-report [value]', 'Show report on final page (true/false)')
    .option('--enable-expert [value]', 'Show expert chat on final page (true/false)')
    .option('--logo <logo>', 'Logo icon (Font Awesome class or image URL)')
    .option('--enable-logo [value]', 'Show logo (true/false)')
    .action(async (opts) => {
      let cmd = `assess connect final-page add --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.name) cmd += ` --name "${escapeArg(opts.name)}"`;
      if (opts.format) cmd += ` --format ${opts.format}`;
      if (opts.layout) cmd += ` --layout ${opts.layout}`;
      if (opts.value) cmd += ` --value "${escapeArg(opts.value)}"`;
      if (opts.description) cmd += ` --description "${escapeArg(opts.description)}"`;
      if (opts.subtitle) cmd += ` --subtitle "${escapeArg(opts.subtitle)}"`;
      const ess = normBool(opts.enableSplitScreen);
      if (ess !== undefined) cmd += ` --enable-split-screen=${ess}`;
      const eh = normBool(opts.enableHead);
      if (eh !== undefined) cmd += ` --enable-head=${eh}`;
      const etw = normBool(opts.enableTitleWriter);
      if (etw !== undefined) cmd += ` --enable-title-writer=${etw}`;
      const er = normBool(opts.enableReport);
      if (er !== undefined) cmd += ` --enable-report=${er}`;
      const ee = normBool(opts.enableExpert);
      if (ee !== undefined) cmd += ` --enable-expert=${ee}`;
      if (opts.logo) cmd += ` --logo "${escapeArg(opts.logo)}"`;
      const el = normBool(opts.enableLogo);
      if (el !== undefined) cmd += ` --enable-logo=${el}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  finalPage
    .command('update')
    .description('Update a final page')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <pageId>', 'Page ID (required when multiple final pages)')
    .option('--name <name>', 'Page name')
    .option('--format <format>', 'Page format (rich-text/url/report-pdf/fill-rank/block-scale/expert/order-pay)')
    .option('--layout <layout>', 'Page layout')
    .option('--value <html>', 'Top content (rich text HTML)')
    .option('--description <html>', 'Bottom content (rich text HTML)')
    .option('--subtitle <text>', 'Subtitle text')
    .option('--enable-split-screen [value]', 'Enable split-screen display (true/false)')
    .option('--enable-head [value]', 'Show title area (true/false)')
    .option('--enable-title-writer [value]', 'Enable typewriter animation (true/false)')
    .option('--enable-report [value]', 'Show report on final page (true/false)')
    .option('--enable-expert [value]', 'Show expert chat on final page (true/false)')
    .option('--logo <logo>', 'Logo icon (Font Awesome class or image URL)')
    .option('--enable-logo [value]', 'Show logo (true/false)')
    .option('--logo-size <size>', 'Logo size in px (32~120, default: 68)', parseInt)
    .option('--enable-logo-icon [value]', 'Use preset icon instead of uploaded image (true/false)')
    .action(async (opts) => {
      let cmd = `assess connect final-page update --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.name) cmd += ` --name "${escapeArg(opts.name)}"`;
      if (opts.format) cmd += ` --format ${opts.format}`;
      if (opts.layout) cmd += ` --layout ${opts.layout}`;
      if (opts.value) cmd += ` --value "${escapeArg(opts.value)}"`;
      if (opts.description) cmd += ` --description "${escapeArg(opts.description)}"`;
      if (opts.subtitle) cmd += ` --subtitle "${escapeArg(opts.subtitle)}"`;
      const ess = normBool(opts.enableSplitScreen);
      if (ess !== undefined) cmd += ` --enable-split-screen=${ess}`;
      const eh = normBool(opts.enableHead);
      if (eh !== undefined) cmd += ` --enable-head=${eh}`;
      const etw = normBool(opts.enableTitleWriter);
      if (etw !== undefined) cmd += ` --enable-title-writer=${etw}`;
      const er = normBool(opts.enableReport);
      if (er !== undefined) cmd += ` --enable-report=${er}`;
      const ee = normBool(opts.enableExpert);
      if (ee !== undefined) cmd += ` --enable-expert=${ee}`;
      if (opts.logo) cmd += ` --logo "${escapeArg(opts.logo)}"`;
      const el = normBool(opts.enableLogo);
      if (el !== undefined) cmd += ` --enable-logo=${el}`;
      if (opts.logoSize !== undefined) cmd += ` --logo-size ${opts.logoSize}`;
      const eli = normBool(opts.enableLogoIcon);
      if (eli !== undefined) cmd += ` --enable-logo-icon=${eli}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  finalPage
    .command('find')
    .description('Get final page full details (including value/description HTML)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <pageId>', 'Page ID (required when multiple final pages)')
    .action(async (opts) => {
      let cmd = `assess connect final-page find --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  finalPage
    .command('set')
    .description('Set a single property on final page (any field from find output)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <pageId>', 'Page ID (required when multiple final pages)')
    .requiredOption('--property <property>', 'Property path (e.g. name/value/description/enableReport/enableExpert/format/layout)')
    .requiredOption('--value <value>', 'New value')
    .action(async (opts) => {
      let cmd = `assess connect final-page set --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      cmd += ` --property ${opts.property} --value "${escapeArg(opts.value)}" --json`;
      const result = await execCommand(cmd);
      output(result);
    });

  finalPage
    .command('remove')
    .description('Remove a final page')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <pageId>', 'Page ID (required when multiple final pages)')
    .action(async (opts) => {
      let cmd = `assess connect final-page remove --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  // ========== Main Page ==========

  const mainPage = connect.command('main-page').description('Main page (form display) management');

  mainPage
    .command('set')
    .description('Set main page format (form/field/card) or field-level description')
    .requiredOption('--app <appId>', 'App ID')
    .option('--format <format>', 'Page format: form (all-in-one) / field (one-per-page) / card (card-style)')
    .option('--field <fieldKey>', 'Field key (e.g. X1) — when set, updates field-level description instead of format')
    .option('--description <html>', 'Field description HTML/SVG (use with --field)')
    .option('--clear [value]', 'Clear field description (use with --field)')
    .action(async (opts) => {
      let cmd = `assess connect main-page set --app ${opts.app}`;
      if (opts.format) cmd += ` --format ${opts.format}`;
      if (opts.field) cmd += ` --field ${opts.field}`;
      if (opts.description) cmd += ` --description "${escapeArg(opts.description)}"`;
      const clr = normBool(opts.clear);
      if (clr !== undefined) cmd += ` --clear=${clr}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  // ========== Style ==========

  const style = connect.command('style').description('Visual style & theme customization');

  style
    .command('set')
    .description('Set theme colors for a specific page type (fine-grained color control)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--type <type>', 'Page type: cover / main / final')
    .option('--bg <color>', 'Background color (hex, e.g. #f3f3fe)')
    .option('--fg <color>', 'Content area foreground color (hex)')
    .option('--font <color>', 'Body text font color (hex)')
    .option('--panel <color>', 'Panel/form area background color (hex)')
    .option('--chat <color>', 'Chat bubble background color (hex, chat mode only)')
    .option('--bg-image <url>', 'Background image URL')
    .option('--bg-color <color>', 'Background base color (for gradient overlay)')
    .option('--bg-fill [value]', 'Background image fill mode (true/false)')
    .option('--head <color>', 'Header area background color')
    .option('--head-image <url>', 'Header area background image URL')
    .option('--hide-head [value]', 'Hide header area (true/false)')
    .option('--foot <color>', 'Footer area background color')
    .option('--action <color>', 'Action button background color')
    .option('--submit-label <text>', 'Button text (cover: "Start", final: "Close")')
    .option('--align <align>', 'Content alignment: left / center / right')
    .option('--writer-speed <ms>', 'Typewriter speed (ms/char): 40 fast / 80 medium / 120 slow')
    .option('--writer-action <action>', 'Typewriter completion action: show / hide / replace')
    .option('--writer-action-value <text>', 'Replace text (only when --writer-action replace)')
    .option('--id <pageId>', 'Page ID (overrides --type for precise targeting)')
    .action(async (opts) => {
      let cmd = `assess connect style set --app ${opts.app}`;
      if (opts.type) cmd += ` --type ${opts.type}`;
      if (opts.bg) cmd += ` --bg ${opts.bg}`;
      if (opts.fg) cmd += ` --fg ${opts.fg}`;
      if (opts.font) cmd += ` --font ${opts.font}`;
      if (opts.panel) cmd += ` --panel ${opts.panel}`;
      if (opts.chat) cmd += ` --chat ${opts.chat}`;
      if (opts.bgImage) cmd += ` --bg-image "${escapeArg(opts.bgImage)}"`;
      if (opts.bgColor) cmd += ` --bg-color ${opts.bgColor}`;
      const bf = normBool(opts.bgFill);
      if (bf !== undefined) cmd += ` --bg-fill=${bf}`;
      if (opts.head) cmd += ` --head ${opts.head}`;
      if (opts.headImage) cmd += ` --head-image "${escapeArg(opts.headImage)}"`;
      const hh = normBool(opts.hideHead);
      if (hh !== undefined) cmd += ` --hide-head=${hh}`;
      if (opts.foot) cmd += ` --foot ${opts.foot}`;
      if (opts.action) cmd += ` --action ${opts.action}`;
      if (opts.submitLabel) cmd += ` --submit-label "${escapeArg(opts.submitLabel)}"`;
      if (opts.align) cmd += ` --align ${opts.align}`;
      if (opts.writerSpeed) cmd += ` --writer-speed ${opts.writerSpeed}`;
      if (opts.writerAction) cmd += ` --writer-action ${opts.writerAction}`;
      if (opts.writerActionValue) cmd += ` --writer-action-value "${escapeArg(opts.writerActionValue)}"`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  style
    .command('query')
    .description('Query current theme config for a page type')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--type <type>', 'Page type: cover / main / final')
    .action(async (opts) => {
      const cmd = `assess connect style query --app ${opts.app} --type ${opts.type} --json`;
      const result = await execCommand(cmd);
      output(result);
    });

  style
    .command('apply')
    .description('Apply preset theme and/or AI-generated style. P0: --theme must be a design mode (scenic/skeuomorphic/liquid/glassmorphism/immersive/minimalist). --look must describe scenario + visual style (e.g. "心理健康评估，深蓝科技风，磨砂玻璃卡片")')
    .requiredOption('--app <appId>', 'App ID')
    .option('--theme <theme>', 'Preset theme name or design mode: Minimal/Fresh/.../Mystic or scenic/skeuomorphic/liquid/glassmorphism/immersive/minimalist')
    .option('--look <description>', 'AI visual style description (e.g. "deep blue tech, frosted glass cards")')
    .option('--layout <layout>', 'Layout style: flat / stack / cube')
    .option('--type <type>', 'Target page type: cover / main / final (omit to apply to all pages)')
    .option('--page-id <pageId>', 'Target page ID (precise, overrides --type; omit for all pages)')
    .action(async (opts) => {
      let cmd = `assess connect style apply --app ${opts.app}`;
      if (opts.theme) cmd += ` --theme ${opts.theme}`;
      if (opts.look) cmd += ` --look "${escapeArg(opts.look)}"`;
      if (opts.layout) cmd += ` --layout ${opts.layout}`;
      if (opts.type) cmd += ` --type ${opts.type}`;
      if (opts.pageId) cmd += ` --page-id ${opts.pageId}`;
      cmd += ' --json';
      const result = await execCommand(cmd, undefined, TIMEOUT_STYLE);
      output(result);
    });

  style
    .command('apply-all')
    .description('Apply AI-generated style to ALL pages at once (generates style once, applies everywhere). P0: --look is required and must include scenario + visual style')
    .requiredOption('--app <appId>', 'App ID')
    .option('--theme <theme>', 'Preset theme name or design mode identifier')
    .option('--look <description>', 'AI visual style description (required)')
    .option('--layout <layout>', 'Layout style: flat / stack / cube')
    .action(async (opts) => {
      let cmd = `assess connect style apply-all --app ${opts.app}`;
      if (opts.theme) cmd += ` --theme ${opts.theme}`;
      if (opts.look) cmd += ` --look "${escapeArg(opts.look)}"`;
      if (opts.layout) cmd += ` --layout ${opts.layout}`;
      cmd += ' --json';
      const result = await execCommand(cmd, undefined, TIMEOUT_STYLE);
      output(result);
    });

  style
    .command('move')
    .description('Move a page up or down in display order')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--id <pageId>', 'Page ID')
    .requiredOption('--direction <direction>', 'Move direction: up / down')
    .action(async (opts) => {
      const cmd = `assess connect style move --app ${opts.app} --id ${opts.id} --direction ${opts.direction} --json`;
      const result = await execCommand(cmd);
      output(result);
    });
}
