import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output } from '../output.js';
import { escapeArg, normBool } from '../utils.js';

export function registerScaleCommand(parent: Command): void {
  const scale = parent.command('scale').description('Scale dimensions, field associations & score ranges');

  // ========== Dimension Management ==========

  scale
    .command('query')
    .alias('list')
    .description('List all scale dimensions (use --md for token-efficient markdown)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--md', 'Markdown table output (for AI)')
    .option('--human', 'Humanized display (hides system IDs)')
    .option('--filter <keyword>', 'Keyword filter (matches id/name/keys)')
    .action(async (opts) => {
      let cmd = `assess scale query --app ${opts.app}`;
      if (opts.md) cmd += ' --md';
      if (opts.human) cmd += ' --human';
      if (opts.filter) cmd += ` --filter "${escapeArg(opts.filter)}"`;
      if (!opts.md && !opts.human) cmd += ' --json';
      output(await execCommand(cmd));
    });

  scale
    .command('find')
    .description('Find a single scale dimension by ID or keyword (returns full details)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <scaleId>', 'Scale dimension ID')
    .option('--filter <keyword>', 'Keyword filter')
    .action(async (opts) => {
      let cmd = `assess scale find --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.filter) cmd += ` --filter "${escapeArg(opts.filter)}"`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  scale
    .command('add')
    .description('Add a scale dimension (or update if ID exists). Required before adding score ranges')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--id <scaleId>', 'Dimension ID')
    .requiredOption('--name <name>', 'Dimension name')
    .option('--format <format>', 'Calculation: sum (total) / avg (average) / count (item count)', 'sum')
    .option('--direction <direction>', 'Scale direction: positive (high=good) / negative (symptom, high=bad)')
    .option('--weight <weight>', 'Dimension weight', parseFloat)
    .option('--kbText <text>', 'Knowledge base text (required by server, max 500 chars)')
    .action(async (opts) => {
      let cmd = `assess scale add --app ${opts.app} --id ${opts.id} --name "${escapeArg(opts.name)}" --format ${opts.format}`;
      if (opts.direction) cmd += ` --direction ${opts.direction}`;
      if (opts.weight !== undefined) cmd += ` --weight ${opts.weight}`;
      if (opts.kbText) cmd += ` --kbText "${escapeArg(opts.kbText)}"`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  scale
    .command('update')
    .description('Update a scale dimension')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--id <scaleId>', 'Dimension ID')
    .option('--name <name>', 'Dimension name')
    .option('--format <format>', 'Calculation: sum / avg / count')
    .option('--direction <direction>', 'Scale direction: positive / negative')
    .option('--weight <weight>', 'Dimension weight', parseFloat)
    .option('--kbText <text>', 'Knowledge base text (max 500 chars)')
    .action(async (opts) => {
      let cmd = `assess scale update --app ${opts.app} --id ${opts.id}`;
      if (opts.name) cmd += ` --name "${escapeArg(opts.name)}"`;
      if (opts.format) cmd += ` --format ${opts.format}`;
      if (opts.direction) cmd += ` --direction ${opts.direction}`;
      if (opts.weight !== undefined) cmd += ` --weight ${opts.weight}`;
      if (opts.kbText) cmd += ` --kbText "${escapeArg(opts.kbText)}"`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  scale
    .command('set')
    .description('Set a single property on a scale dimension (name/format/direction/weight/kbText/maxScore/minScore/negKeys/data.<id>.value)')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--id <scaleId>', 'Dimension ID')
    .requiredOption('--property <property>', 'Property path (e.g. name, format, direction, data.<dataId>.value)')
    .requiredOption('--value <value>', 'New value')
    .action(async (opts) => {
      const cmd = `assess scale set --app ${opts.app} --id ${opts.id} --property ${opts.property} --value "${escapeArg(opts.value)}" --json`;
      output(await execCommand(cmd));
    });

  scale
    .command('remove')
    .description('Remove a scale dimension')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--id <scaleId>', 'Dimension ID')
    .action(async (opts) => {
      const cmd = `assess scale remove --app ${opts.app} --id ${opts.id} --json`;
      output(await execCommand(cmd));
    });

  scale
    .command('clear')
    .description('Clear all scale dimensions')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const cmd = `assess scale clear --app ${opts.app} --json`;
      output(await execCommand(cmd));
    });

  scale
    .command('config')
    .description('Configure global scale options (enableSingle / enableOption)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--enable-single [value]', 'Single display mode: only show matched dimension result (true/false)')
    .option('--enable-option [value]', 'Expand option sub-items when associating dimensions (true/false)')
    .action(async (opts) => {
      let cmd = `assess scale config --app ${opts.app}`;
      const es = normBool(opts.enableSingle);
      if (es !== undefined) cmd += ` --enable-single=${es}`;
      const eo = normBool(opts.enableOption);
      if (eo !== undefined) cmd += ` --enable-option=${eo}`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  // ========== Keys (Field Association) Management ==========

  const keys = scale.command('keys').description('Associate fields with scale dimensions');

  keys
    .command('add')
    .description('Associate fields with a scale dimension (via Field key). Supports --fields for batch, --polarities for auto reverse-scored fields')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--scale <scaleId>', 'Dimension ID')
    .option('--field <fieldKey>', 'Single field key (use with --fields for batch)')
    .option('--fields <fieldKeys>', 'Batch field keys, comma-separated (e.g. X1,X2,X3)')
    .option('--polarities <polarities>', 'Field polarity declarations: fieldKey:positive/symptom,... (auto-computes reverse-scored fields)')
    .option('--negFields <fieldKeys>', '[Deprecated] Reverse-scored field keys, comma-separated. Use --polarities instead')
    .action(async (opts) => {
      let cmd = `assess scale keys add --app ${opts.app} --scale ${opts.scale}`;
      if (opts.field) cmd += ` --field ${opts.field}`;
      if (opts.fields) cmd += ` --fields ${opts.fields}`;
      if (opts.polarities) cmd += ` --polarities ${opts.polarities}`;
      if (opts.negFields) cmd += ` --negFields ${opts.negFields}`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  keys
    .command('remove')
    .description('Disassociate fields from a scale dimension')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--scale <scaleId>', 'Dimension ID')
    .option('--field <fieldKey>', 'Single field key')
    .option('--fields <fieldKeys>', 'Batch field keys, comma-separated')
    .action(async (opts) => {
      let cmd = `assess scale keys remove --app ${opts.app} --scale ${opts.scale}`;
      if (opts.field) cmd += ` --field ${opts.field}`;
      if (opts.fields) cmd += ` --fields ${opts.fields}`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  keys
    .command('list')
    .description('List fields associated with a scale dimension')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--scale <scaleId>', 'Dimension ID')
    .action(async (opts) => {
      const cmd = `assess scale keys list --app ${opts.app} --scale ${opts.scale} --json`;
      output(await execCommand(cmd));
    });

  keys
    .command('set')
    .description('Set scoring direction for associated fields (negScore=true=reverse, false=normal)')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--scale <scaleId>', 'Dimension ID')
    .requiredOption('--fields <fieldKeys>', 'Field keys, comma-separated')
    .requiredOption('--negScore <bool>', 'true=reverse-scored (high score inverted), false=normal', (v: string) => v === 'true')
    .action(async (opts) => {
      const cmd = `assess scale keys set --app ${opts.app} --scale ${opts.scale} --fields ${opts.fields} --negScore ${opts.negScore} --json`;
      output(await execCommand(cmd));
    });

  // ========== Data (Score Ranges) Management ==========

  const data = scale.command('data').description('Score range (result tier) management');

  data
    .command('add')
    .description('Add score ranges. Batch mode: --ranges "0-7:Normal,8-14:Mild,15-21:Severe". Single mode: --min --max --value')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--scale <scaleId>', 'Dimension ID')
    .option('--ranges <ranges>', 'Batch format: min-max:value[:desc], comma-separated. e.g. "0-7:Normal,8-14:Mild,15-21:Severe"')
    .option('--id <dataId>', 'Range ID (auto-generated if omitted, single mode only)')
    .option('--min <min>', 'Min score (single mode)', parseFloat)
    .option('--max <max>', 'Max score (single mode)', parseFloat)
    .option('--value <value>', 'Result label (single mode)')
    .option('--desc <description>', 'Range description')
    .option('--unique [value]', 'Unique display in enableSingle mode (true/false)')
    .action(async (opts) => {
      let cmd = `assess scale data add --app ${opts.app} --scale ${opts.scale}`;
      if (opts.ranges) cmd += ` --ranges "${escapeArg(opts.ranges)}"`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.min !== undefined) cmd += ` --min ${opts.min}`;
      if (opts.max !== undefined) cmd += ` --max ${opts.max}`;
      if (opts.value) cmd += ` --value "${escapeArg(opts.value)}"`;
      if (opts.desc) cmd += ` --desc "${escapeArg(opts.desc)}"`;
      const u = normBool(opts.unique);
      if (u !== undefined) cmd += ` --unique=${u}`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  data
    .command('update')
    .description('Update a score range')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--scale <scaleId>', 'Dimension ID')
    .requiredOption('--id <dataId>', 'Range ID')
    .option('--min <min>', 'Min score', parseFloat)
    .option('--max <max>', 'Max score', parseFloat)
    .option('--value <value>', 'Result label')
    .option('--desc <description>', 'Range description')
    .option('--unique [value]', 'Unique display (true/false)')
    .action(async (opts) => {
      let cmd = `assess scale data update --app ${opts.app} --scale ${opts.scale} --id ${opts.id}`;
      if (opts.min !== undefined) cmd += ` --min ${opts.min}`;
      if (opts.max !== undefined) cmd += ` --max ${opts.max}`;
      if (opts.value) cmd += ` --value "${escapeArg(opts.value)}"`;
      if (opts.desc) cmd += ` --desc "${escapeArg(opts.desc)}"`;
      const u = normBool(opts.unique);
      if (u !== undefined) cmd += ` --unique=${u}`;
      cmd += ' --json';
      output(await execCommand(cmd));
    });

  data
    .command('remove')
    .description('Remove a score range')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--scale <scaleId>', 'Dimension ID')
    .requiredOption('--id <dataId>', 'Range ID')
    .action(async (opts) => {
      const cmd = `assess scale data remove --app ${opts.app} --scale ${opts.scale} --id ${opts.id} --json`;
      output(await execCommand(cmd));
    });

  data
    .command('list')
    .description('List all score ranges for a dimension')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--scale <scaleId>', 'Dimension ID')
    .action(async (opts) => {
      const cmd = `assess scale data list --app ${opts.app} --scale ${opts.scale} --json`;
      output(await execCommand(cmd));
    });

  data
    .command('clear')
    .description('Clear all score ranges for a dimension')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--scale <scaleId>', 'Dimension ID')
    .action(async (opts) => {
      const cmd = `assess scale data clear --app ${opts.app} --scale ${opts.scale} --json`;
      output(await execCommand(cmd));
    });
}
