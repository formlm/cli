import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output } from '../output.js';

function normBool(v: unknown): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'boolean') return v;
  return v === 'true' || v === '1';
}

export function registerReportCommand(parent: Command): void {
  const report = parent.command('report').description('Report pages, widgets & conditional logic');

  // ========== Top-level Query ==========

  report
    .command('query')
    .description('Query all report pages & widgets (use --md for token-efficient markdown)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--md', 'Markdown table output (for AI)')
    .option('--human', 'Humanized display')
    .option('--filter <keyword>', 'Keyword filter (page name/id or widget type/scaleId/fieldKey)')
    .option('--expand-page', 'With --filter, expand matched widget pages fully')
    .action(async (opts) => {
      let cmd = `assess report query --app ${opts.app}`;
      if (opts.md) cmd += ' --md';
      if (opts.human) cmd += ' --human';
      if (opts.filter) cmd += ` --filter "${opts.filter}"`;
      if (opts.expandPage) cmd += ' --expand-page';
      if (!opts.md && !opts.human) cmd += ' --json';
      output(await execCommand(cmd));
    });

  report
    .command('find')
    .description('Find a single widget by page+id (exact) or --filter (fuzzy, returns first match with full details)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--page <pageId>', 'Page ID (use with --id for exact query)')
    .option('--id <widgetId>', 'Widget ID (use with --page for exact query)')
    .option('--filter <keyword>', 'Keyword filter (matches widget id/type/scaleId/fieldKey)')
    .action(async (opts) => {
      let cmd = `assess report find --app ${opts.app}`;
      if (opts.page) cmd += ` --page ${opts.page}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.filter) cmd += ` --filter "${opts.filter}"`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  // ========== Page Management ==========

  const page = report.command('page').description('Report page management');

  page
    .command('add')
    .description('Add a report page (canvas for widgets)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <pageId>', 'Page ID (auto-generated if omitted)')
    .requiredOption('--name <name>', 'Page name')
    .option('--type <type>', 'Page type (default: A4)', 'A4')
    .option('--backgroundColor <color>', 'Background color (hex, e.g. #0a0a0a)')
    .option('--style <css>', 'Extra CSS styles (e.g. background gradient)')
    .option('--bgSvg <svg>', 'SVG background image (full <svg> markup)')
    .action(async (opts) => {
      let cmd = `assess report page add --app ${opts.app} --name "${opts.name}" --type ${opts.type}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.backgroundColor) cmd += ` --backgroundColor ${opts.backgroundColor}`;
      if (opts.style) cmd += ` --style "${opts.style}"`;
      if (opts.bgSvg) cmd += ` --bgSvg "${opts.bgSvg}"`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  page
    .command('update')
    .description('Update page properties (name, background color, style, SVG background). Auto-creates page if not found (upsert)')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--id <pageId>', 'Page ID')
    .option('--name <name>', 'Page name')
    .option('--backgroundColor <color>', 'Background color (hex)')
    .option('--style <css>', 'Extra CSS styles')
    .option('--bgSvg <svg>', 'SVG background image')
    .action(async (opts) => {
      let cmd = `assess report page update --app ${opts.app} --id ${opts.id}`;
      if (opts.name) cmd += ` --name "${opts.name}"`;
      if (opts.backgroundColor) cmd += ` --backgroundColor ${opts.backgroundColor}`;
      if (opts.style) cmd += ` --style "${opts.style}"`;
      if (opts.bgSvg) cmd += ` --bgSvg "${opts.bgSvg}"`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  page
    .command('remove')
    .description('Remove a report page')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--id <pageId>', 'Page ID')
    .action(async (opts) => {
      const cmd = `assess report page remove --app ${opts.app} --id ${opts.id} --json`;
      output(await execCommand(cmd));
    });

  // ========== Widget Management ==========

  const widget = report.command('widget').description('Report widget management');

  widget
    .command('list')
    .description('List all widgets in a page')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--page <pageId>', 'Page ID')
    .action(async (opts) => {
      const cmd = `assess report widget list --app ${opts.app} --page ${opts.page} --json`;
      output(await execCommand(cmd));
    });

  widget
    .command('find')
    .description('Find a single widget with full details (including HTML content)')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--page <pageId>', 'Page ID')
    .requiredOption('--id <widgetId>', 'Widget ID')
    .action(async (opts) => {
      const cmd = `assess report widget find --app ${opts.app} --page ${opts.page} --id ${opts.id} --json`;
      output(await execCommand(cmd));
    });

  widget
    .command('types')
    .description('List all supported widget types')
    .option('--app <appId>', 'App ID')
    .action(async (opts) => {
      let cmd = 'assess report widget types';
      if (opts.app) cmd += ` --app ${opts.app}`;
      output(await execCommand(cmd));
    });

  widget
    .command('config')
    .description('Get configurable properties for a widget type')
    .requiredOption('--type <type>', 'Widget type')
    .option('--app <appId>', 'App ID')
    .action(async (opts) => {
      let cmd = `assess report widget config --type ${opts.type}`;
      if (opts.app) cmd += ` --app ${opts.app}`;
      output(await execCommand(cmd));
    });

  widget
    .command('set')
    .description('Set a single property on a widget (any field from find output, including layoutData.* properties)')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--page <pageId>', 'Page ID')
    .requiredOption('--id <widgetId>', 'Widget ID')
    .requiredOption('--property <property>', 'Property path (e.g. name, value, type, x, y, w, h, scaleId, fieldKey, layoutData.backgroundColor, layoutData.fontSize)')
    .requiredOption('--value <value>', 'New value')
    .action(async (opts) => {
      const cmd = `assess report widget set --app ${opts.app} --page ${opts.page} --id ${opts.id} --property ${opts.property} --value "${opts.value}" --json`;
      output(await execCommand(cmd));
    });

  widget
    .command('add')
    .description('Add a widget to a page. Page uses 68-row × 48-col grid layout; x/y/w/h required and must not overflow or overlap')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--page <pageId>', 'Page ID')
    .option('--id <widgetId>', 'Widget ID (auto-generated if omitted)')
    .option('--name <name>', 'Widget name')
    .option('--type <type>', 'Widget type (use "widget types" to list all)', 'text')
    .option('--x <x>', 'Column position [0-47]', parseInt)
    .option('--y <y>', 'Row position [0-67]', parseInt)
    .option('--w <w>', 'Column width (x+w ≤ 48)', parseInt)
    .option('--h <h>', 'Row height (y+h ≤ 68)', parseInt)
    .option('--value <value>', 'Widget content value')
    .option('--format <format>', 'Chart type: index/donut/pie/bar/h-bar/radar (for scale-chart/field-chart)')
    .option('--scaleId <scaleId>', 'Scale dimension ID (for scale-dimension/scale-chart widgets)')
    .option('--enableOwn [value]', 'Data scope: true=personal / false=overall (for scale-chart/scale-dimension)')
    .option('--fieldKey <fieldKey>', 'Field key (for field-value/field-score/field-chart widgets)')
    .option('--category <category>', 'Widget category (html-embed: widget/url; train-expert: expert/url; time: create; qr-code: text/link)')
    .option('--url <url>', 'Web URL (for html-embed category=url)')
    .option('--enableDisplay [value]', 'Display mode (train-expert: true=widget, false=QR code)')
    .option('--min <min>', 'Min value', parseInt)
    .option('--max <max>', 'Max value', parseInt)
    .option('--aiPrompt <prompt>', 'SVG AI prompt')
    .option('--aiSendData [value]', 'SVG AI: send data (true/false)')
    .option('--aiFieldKeys <keys>', 'SVG AI: field key list')
    .option('--logic <logic>', 'Inline logic condition "min|max|content" (repeatable, use * for no bound)')
    .option('--backgroundColor <color>', 'Layout background color (hex)')
    .option('--roundCorner <n>', 'Corner radius (0-100)', parseInt)
    .option('--fillColor <color>', 'Fill color (hex, for sharp/hr widgets)')
    .option('--enableBorder [value]', 'Enable border (true/false)')
    .option('--borderColor <color>', 'Border color (hex)')
    .option('--borderSize <n>', 'Border width in px', parseInt)
    .option('--paddingSize <n>', 'Padding in px (all directions)', parseInt)
    .option('--paddingTop <n>', 'Top padding px', parseInt)
    .option('--paddingRight <n>', 'Right padding px', parseInt)
    .option('--paddingBottom <n>', 'Bottom padding px', parseInt)
    .option('--paddingLeft <n>', 'Left padding px', parseInt)
    .option('--fontColor <color>', 'Font color (hex)')
    .option('--fontSize <n>', 'Font size in px', parseInt)
    .option('--bold [value]', 'Bold text (true/false)')
    .option('--alignX <align>', 'Horizontal alignment: left/center/right')
    .option('--alignY <align>', 'Vertical alignment: start/center/end')
    .action(async (opts) => {
      let cmd = `assess report widget add --app ${opts.app} --page ${opts.page} --type ${opts.type}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.name) cmd += ` --name "${opts.name}"`;
      if (opts.x !== undefined) cmd += ` --x ${opts.x}`;
      if (opts.y !== undefined) cmd += ` --y ${opts.y}`;
      if (opts.w !== undefined) cmd += ` --w ${opts.w}`;
      if (opts.h !== undefined) cmd += ` --h ${opts.h}`;
      if (opts.value) cmd += ` --value "${opts.value}"`;
      if (opts.format) cmd += ` --format ${opts.format}`;
      if (opts.scaleId) cmd += ` --scaleId ${opts.scaleId}`;
      const eo = normBool(opts.enableOwn);
      if (eo !== undefined) cmd += ` --enableOwn=${eo}`;
      if (opts.fieldKey) cmd += ` --fieldKey ${opts.fieldKey}`;
      if (opts.category) cmd += ` --category ${opts.category}`;
      if (opts.url) cmd += ` --url ${opts.url}`;
      const ed = normBool(opts.enableDisplay);
      if (ed !== undefined) cmd += ` --enableDisplay=${ed}`;
      if (opts.min !== undefined) cmd += ` --min ${opts.min}`;
      if (opts.max !== undefined) cmd += ` --max ${opts.max}`;
      if (opts.aiPrompt) cmd += ` --aiPrompt "${opts.aiPrompt}"`;
      const asd = normBool(opts.aiSendData);
      if (asd !== undefined) cmd += ` --aiSendData=${asd}`;
      if (opts.aiFieldKeys) cmd += ` --aiFieldKeys ${opts.aiFieldKeys}`;
      if (opts.logic) cmd += ` --logic "${opts.logic}"`;
      if (opts.backgroundColor) cmd += ` --backgroundColor ${opts.backgroundColor}`;
      if (opts.roundCorner !== undefined) cmd += ` --roundCorner ${opts.roundCorner}`;
      if (opts.fillColor) cmd += ` --fillColor ${opts.fillColor}`;
      const eb = normBool(opts.enableBorder);
      if (eb !== undefined) cmd += ` --enableBorder=${eb}`;
      if (opts.borderColor) cmd += ` --borderColor ${opts.borderColor}`;
      if (opts.borderSize !== undefined) cmd += ` --borderSize ${opts.borderSize}`;
      if (opts.paddingSize !== undefined) cmd += ` --paddingSize ${opts.paddingSize}`;
      if (opts.paddingTop !== undefined) cmd += ` --paddingTop ${opts.paddingTop}`;
      if (opts.paddingRight !== undefined) cmd += ` --paddingRight ${opts.paddingRight}`;
      if (opts.paddingBottom !== undefined) cmd += ` --paddingBottom ${opts.paddingBottom}`;
      if (opts.paddingLeft !== undefined) cmd += ` --paddingLeft ${opts.paddingLeft}`;
      if (opts.fontColor) cmd += ` --fontColor ${opts.fontColor}`;
      if (opts.fontSize !== undefined) cmd += ` --fontSize ${opts.fontSize}`;
      const b = normBool(opts.bold);
      if (b !== undefined) cmd += ` --bold=${b}`;
      if (opts.alignX) cmd += ` --alignX ${opts.alignX}`;
      if (opts.alignY) cmd += ` --alignY ${opts.alignY}`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  widget
    .command('update')
    .description('Update a widget. Same parameters as "widget add" but --id is required. Use "widget set" for single-property changes')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--page <pageId>', 'Page ID')
    .requiredOption('--id <widgetId>', 'Widget ID')
    .option('--name <name>', 'Widget name')
    .option('--type <type>', 'Widget type')
    .option('--x <x>', 'Column position', parseInt)
    .option('--y <y>', 'Row position', parseInt)
    .option('--w <w>', 'Column width', parseInt)
    .option('--h <h>', 'Row height', parseInt)
    .option('--value <value>', 'Widget content value')
    .option('--format <format>', 'Chart type')
    .option('--scaleId <scaleId>', 'Scale dimension ID')
    .option('--enableOwn [value]', 'Data scope (true=personal/false=overall)')
    .option('--fieldKey <fieldKey>', 'Field key')
    .option('--category <category>', 'Widget category')
    .option('--url <url>', 'Web URL')
    .option('--enableDisplay [value]', 'Display mode')
    .option('--min <min>', 'Min value', parseInt)
    .option('--max <max>', 'Max value', parseInt)
    .option('--aiPrompt <prompt>', 'SVG AI prompt')
    .option('--aiSendData [value]', 'SVG AI: send data')
    .option('--aiFieldKeys <keys>', 'SVG AI: field keys')
    .option('--logic <logic>', 'Inline logic "min|max|content" (repeatable)')
    .option('--backgroundColor <color>', 'Background color')
    .option('--roundCorner <n>', 'Corner radius', parseInt)
    .option('--fillColor <color>', 'Fill color')
    .option('--enableBorder [value]', 'Enable border')
    .option('--borderColor <color>', 'Border color')
    .option('--borderSize <n>', 'Border width px', parseInt)
    .option('--paddingSize <n>', 'Padding px', parseInt)
    .option('--paddingTop <n>', 'Top padding px', parseInt)
    .option('--paddingRight <n>', 'Right padding px', parseInt)
    .option('--paddingBottom <n>', 'Bottom padding px', parseInt)
    .option('--paddingLeft <n>', 'Left padding px', parseInt)
    .option('--fontColor <color>', 'Font color')
    .option('--fontSize <n>', 'Font size px', parseInt)
    .option('--bold [value]', 'Bold text')
    .option('--alignX <align>', 'Horizontal alignment')
    .option('--alignY <align>', 'Vertical alignment')
    .action(async (opts) => {
      let cmd = `assess report widget update --app ${opts.app} --page ${opts.page} --id ${opts.id}`;
      if (opts.name) cmd += ` --name "${opts.name}"`;
      if (opts.type) cmd += ` --type ${opts.type}`;
      if (opts.x !== undefined) cmd += ` --x ${opts.x}`;
      if (opts.y !== undefined) cmd += ` --y ${opts.y}`;
      if (opts.w !== undefined) cmd += ` --w ${opts.w}`;
      if (opts.h !== undefined) cmd += ` --h ${opts.h}`;
      if (opts.value) cmd += ` --value "${opts.value}"`;
      if (opts.format) cmd += ` --format ${opts.format}`;
      if (opts.scaleId) cmd += ` --scaleId ${opts.scaleId}`;
      const eo = normBool(opts.enableOwn);
      if (eo !== undefined) cmd += ` --enableOwn=${eo}`;
      if (opts.fieldKey) cmd += ` --fieldKey ${opts.fieldKey}`;
      if (opts.category) cmd += ` --category ${opts.category}`;
      if (opts.url) cmd += ` --url ${opts.url}`;
      const ed = normBool(opts.enableDisplay);
      if (ed !== undefined) cmd += ` --enableDisplay=${ed}`;
      if (opts.min !== undefined) cmd += ` --min ${opts.min}`;
      if (opts.max !== undefined) cmd += ` --max ${opts.max}`;
      if (opts.aiPrompt) cmd += ` --aiPrompt "${opts.aiPrompt}"`;
      const asd = normBool(opts.aiSendData);
      if (asd !== undefined) cmd += ` --aiSendData=${asd}`;
      if (opts.aiFieldKeys) cmd += ` --aiFieldKeys ${opts.aiFieldKeys}`;
      if (opts.logic) cmd += ` --logic "${opts.logic}"`;
      if (opts.backgroundColor) cmd += ` --backgroundColor ${opts.backgroundColor}`;
      if (opts.roundCorner !== undefined) cmd += ` --roundCorner ${opts.roundCorner}`;
      if (opts.fillColor) cmd += ` --fillColor ${opts.fillColor}`;
      const eb = normBool(opts.enableBorder);
      if (eb !== undefined) cmd += ` --enableBorder=${eb}`;
      if (opts.borderColor) cmd += ` --borderColor ${opts.borderColor}`;
      if (opts.borderSize !== undefined) cmd += ` --borderSize ${opts.borderSize}`;
      if (opts.paddingSize !== undefined) cmd += ` --paddingSize ${opts.paddingSize}`;
      if (opts.paddingTop !== undefined) cmd += ` --paddingTop ${opts.paddingTop}`;
      if (opts.paddingRight !== undefined) cmd += ` --paddingRight ${opts.paddingRight}`;
      if (opts.paddingBottom !== undefined) cmd += ` --paddingBottom ${opts.paddingBottom}`;
      if (opts.paddingLeft !== undefined) cmd += ` --paddingLeft ${opts.paddingLeft}`;
      if (opts.fontColor) cmd += ` --fontColor ${opts.fontColor}`;
      if (opts.fontSize !== undefined) cmd += ` --fontSize ${opts.fontSize}`;
      const b = normBool(opts.bold);
      if (b !== undefined) cmd += ` --bold=${b}`;
      if (opts.alignX) cmd += ` --alignX ${opts.alignX}`;
      if (opts.alignY) cmd += ` --alignY ${opts.alignY}`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  widget
    .command('remove')
    .description('Remove a widget from a page')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--page <pageId>', 'Page ID')
    .requiredOption('--id <widgetId>', 'Widget ID')
    .action(async (opts) => {
      const cmd = `assess report widget remove --app ${opts.app} --page ${opts.page} --id ${opts.id} --json`;
      output(await execCommand(cmd));
    });

  // ========== Logic (Conditional Display Rules) ==========

  const logic = widget.command('logic').description('Conditional display rules (for scale-dimension widgets)');

  logic
    .command('add')
    .description('Add a conditional display rule: when dimension score is in [min, max], show content (supports {{variables}})')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--page <pageId>', 'Page ID')
    .requiredOption('--id <widgetId>', 'Widget ID')
    .option('--min <min>', 'Score lower bound (inclusive, omit for no lower bound)', parseFloat)
    .option('--max <max>', 'Score upper bound (inclusive, omit for no upper bound)', parseFloat)
    .requiredOption('--content <content>', 'Display content when condition is met (HTML, supports {{DimensionName}} {{DimensionScore}} {{DimensionTotal}} {{DimensionValue}} {{DimensionDesc}})')
    .option('--backgroundColor <color>', 'Background color (CSS)')
    .option('--roundCorner <n>', 'Corner radius (0-100)', parseInt)
    .option('--fillColor <color>', 'Fill color (for sharp/hr widgets)')
    .option('--enableBorder [value]', 'Enable border')
    .option('--borderColor <color>', 'Border color')
    .option('--borderSize <n>', 'Border width px', parseInt)
    .option('--paddingSize <n>', 'Padding px', parseInt)
    .option('--paddingTop <n>', 'Top padding px', parseInt)
    .option('--paddingRight <n>', 'Right padding px', parseInt)
    .option('--paddingBottom <n>', 'Bottom padding px', parseInt)
    .option('--paddingLeft <n>', 'Left padding px', parseInt)
    .option('--fontColor <color>', 'Font color')
    .option('--fontSize <n>', 'Font size px', parseInt)
    .option('--bold [value]', 'Bold text')
    .action(async (opts) => {
      let cmd = `assess report widget logic add --app ${opts.app} --page ${opts.page} --id ${opts.id} --content "${opts.content}"`;
      if (opts.min !== undefined) cmd += ` --min ${opts.min}`;
      if (opts.max !== undefined) cmd += ` --max ${opts.max}`;
      if (opts.backgroundColor) cmd += ` --backgroundColor ${opts.backgroundColor}`;
      if (opts.roundCorner !== undefined) cmd += ` --roundCorner ${opts.roundCorner}`;
      if (opts.fillColor) cmd += ` --fillColor ${opts.fillColor}`;
      const eb = normBool(opts.enableBorder);
      if (eb !== undefined) cmd += ` --enableBorder=${eb}`;
      if (opts.borderColor) cmd += ` --borderColor ${opts.borderColor}`;
      if (opts.borderSize !== undefined) cmd += ` --borderSize ${opts.borderSize}`;
      if (opts.paddingSize !== undefined) cmd += ` --paddingSize ${opts.paddingSize}`;
      if (opts.paddingTop !== undefined) cmd += ` --paddingTop ${opts.paddingTop}`;
      if (opts.paddingRight !== undefined) cmd += ` --paddingRight ${opts.paddingRight}`;
      if (opts.paddingBottom !== undefined) cmd += ` --paddingBottom ${opts.paddingBottom}`;
      if (opts.paddingLeft !== undefined) cmd += ` --paddingLeft ${opts.paddingLeft}`;
      if (opts.fontColor) cmd += ` --fontColor ${opts.fontColor}`;
      if (opts.fontSize !== undefined) cmd += ` --fontSize ${opts.fontSize}`;
      const b = normBool(opts.bold);
      if (b !== undefined) cmd += ` --bold=${b}`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  logic
    .command('list')
    .description('List all conditional display rules for a widget')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--page <pageId>', 'Page ID')
    .requiredOption('--id <widgetId>', 'Widget ID')
    .action(async (opts) => {
      const cmd = `assess report widget logic list --app ${opts.app} --page ${opts.page} --id ${opts.id} --json`;
      output(await execCommand(cmd));
    });

  logic
    .command('remove')
    .description('Remove a conditional display rule from a widget')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--page <pageId>', 'Page ID')
    .requiredOption('--id <widgetId>', 'Widget ID')
    .requiredOption('--logicId <logicId>', 'Logic rule ID')
    .action(async (opts) => {
      const cmd = `assess report widget logic remove --app ${opts.app} --page ${opts.page} --id ${opts.id} --logicId ${opts.logicId} --json`;
      output(await execCommand(cmd));
    });
}
