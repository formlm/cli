import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output } from '../output.js';

// Validate field ID: only alphanumeric + underscore (snake_case), no spaces or special chars
function validateFieldId(id: string): void {
  if (!/^[a-zA-Z0-9_]+$/.test(id)) {
    console.error(`❌ Invalid field ID: "${id}". ID must be alphanumeric + underscore (snake_case), e.g. q1_anxiety.`);
    process.exit(1);
  }
}

// 将 commander 可选值布尔选项规范化为 true/false/undefined：
// --flag        → opts.flag === true
// --flag=false  → opts.flag === 'false'（字符串）
// 未传入     → opts.flag === undefined
function normBool(v: unknown): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'boolean') return v;
  return v === 'true' || v === '1';
}

export function registerFieldCommand(parent: Command): void {
  const field = parent.command('field').description('Form field management — P0: --id uses snake_case (e.g. q1_anxiety), --key uses X-prefix fieldKey (e.g. X1). NEVER mix --id and --key. Run "formlm-cli skill form" for full constraints');

  field
    .command('schema')
    .description('List all supported field types')
    .action(async () => {
      const result = await execCommand('assess form types --verbose');
      output(result);
    });

  field
    .command('config')
    .description('Get configurable properties for a field type')
    .requiredOption('--type <type>', 'Field type')
    .action(async (opts) => {
      const result = await execCommand(`assess form config --type ${opts.type}`);
      output(result);
    });

  field
    .command('list')
    .description('List all fields in an app')
    .requiredOption('--app <appId>', 'App ID')
    .action(async (opts) => {
      const result = await execCommand(`assess form query --json --app ${opts.app}`);
      output(result);
    });

  field
    .command('find')
    .description('Get a single field by ID or keyword')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <fieldId>', 'Field ID')
    .option('--key <fieldKey>', 'Field Key')
    .option('--filter <keyword>', 'Keyword filter')
    .action(async (opts) => {
      let cmd = `assess form find --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.key) cmd += ` --key ${opts.key}`;
      if (opts.filter) cmd += ` --filter "${opts.filter}"`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  field
    .command('add')
    .description('Add a new field. P0: --id must be semantic snake_case (e.g. q1_age, phq9_1). For scored fields (radio/select/checkbox), use --options with label:score format (e.g. "Never:0,Sometimes:1,Often:2")')
    .requiredOption('--app <appId>', 'App ID')
    .requiredOption('--id <id>', 'Field ID')
    .option('--type <type>', 'Field type', 'input')
    .option('--title <title>', 'Field title / question text')
    .option('--name <name>', 'Field name')
    .option('--options <options>', 'Options list, comma-separated, supports label:score')
    .option('--required [value]', 'Mark as required (true/false, default: true when flag present)')
    .option('--score <score>', 'Question score')
    .option('--min <min>', 'Min value')
    .option('--max <max>', 'Max value')
    .option('--placeholder <placeholder>', 'Placeholder text')
    .option('--inputMask <inputMask>', 'Input mask')
    .option('--content <content>', 'Field content / description')
    .option('--answer <answer>', 'Correct answer')
    .option('--explanation <explanation>', 'Answer explanation')
    .option('--format <format>', 'Field format')
    .option('--unique [value]', 'Unique value validation (true/false)')
    .option('--shareable [value]', 'Visible on share page (true/false)')
    .action(async (opts) => {
      validateFieldId(opts.id);
      let cmd = `assess form add --app ${opts.app} --id ${opts.id} --type ${opts.type}`;
      if (opts.title) cmd += ` --title "${opts.title}"`;
      if (opts.name) cmd += ` --name "${opts.name}"`;
      if (opts.options) cmd += ` --options "${opts.options}"`;
      const required = normBool(opts.required);
      if (required !== undefined) cmd += ` --required=${required}`;
      if (opts.score !== undefined) cmd += ` --score ${opts.score}`;
      if (opts.min !== undefined) cmd += ` --min ${opts.min}`;
      if (opts.max !== undefined) cmd += ` --max ${opts.max}`;
      if (opts.placeholder) cmd += ` --placeholder "${opts.placeholder}"`;
      if (opts.inputMask) cmd += ` --inputMask ${opts.inputMask}`;
      if (opts.content) cmd += ` --content "${opts.content}"`;
      if (opts.answer) cmd += ` --answer "${opts.answer}"`;
      if (opts.explanation) cmd += ` --explanation "${opts.explanation}"`;
      if (opts.format) cmd += ` --format ${opts.format}`;
      const unique = normBool(opts.unique);
      if (unique !== undefined) cmd += ` --unique=${unique}`;
      const shareable = normBool(opts.shareable);
      if (shareable !== undefined) cmd += ` --shareable=${shareable}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  field
    .command('update')
    .description('Update a field. Use --id or --key to identify (never both). P0: --options replaces all existing options (use comma-separated label:score format)')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <fieldId>', 'Field ID')
    .option('--key <fieldKey>', 'Field Key')
    .option('--type <type>', 'Field type')
    .option('--title <title>', 'Field title / question text')
    .option('--name <name>', 'Field name')
    .option('--options <options>', 'Options list — replaces existing options')
    .option('--required [value]', 'Mark as required (true/false)')
    .option('--score <score>', 'Question score')
    .option('--min <min>', 'Min value')
    .option('--max <max>', 'Max value')
    .option('--placeholder <placeholder>', 'Placeholder text')
    .option('--inputMask <inputMask>', 'Input mask')
    .option('--content <content>', 'Field content / description')
    .option('--answer <answer>', 'Correct answer')
    .option('--explanation <explanation>', 'Answer explanation')
    .option('--format <format>', 'Field format')
    .option('--unique [value]', 'Unique value validation (true/false)')
    .option('--shareable [value]', 'Visible on share page (true/false)')
    .action(async (opts) => {
      if (!opts.id && !opts.key) {
        console.error('❌ Either --id or --key is required');
        process.exit(1);
      }
      let cmd = `assess form update --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.key) cmd += ` --key ${opts.key}`;
      if (opts.type) cmd += ` --type ${opts.type}`;
      if (opts.title) cmd += ` --title "${opts.title}"`;
      if (opts.name) cmd += ` --name "${opts.name}"`;
      if (opts.options) cmd += ` --options "${opts.options}"`;
      const required = normBool(opts.required);
      if (required !== undefined) cmd += ` --required=${required}`;
      if (opts.score !== undefined) cmd += ` --score ${opts.score}`;
      if (opts.min !== undefined) cmd += ` --min ${opts.min}`;
      if (opts.max !== undefined) cmd += ` --max ${opts.max}`;
      if (opts.placeholder) cmd += ` --placeholder "${opts.placeholder}"`;
      if (opts.inputMask) cmd += ` --inputMask ${opts.inputMask}`;
      if (opts.content) cmd += ` --content "${opts.content}"`;
      if (opts.answer) cmd += ` --answer "${opts.answer}"`;
      if (opts.explanation) cmd += ` --explanation "${opts.explanation}"`;
      if (opts.format) cmd += ` --format ${opts.format}`;
      const unique = normBool(opts.unique);
      if (unique !== undefined) cmd += ` --unique=${unique}`;
      const shareable = normBool(opts.shareable);
      if (shareable !== undefined) cmd += ` --shareable=${shareable}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  field
    .command('remove')
    .description('Remove a field')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <fieldId>', 'Field ID')
    .option('--key <fieldKey>', 'Field Key')
    .action(async (opts) => {
      if (!opts.id && !opts.key) {
        console.error('❌ Either --id or --key is required');
        process.exit(1);
      }
      let cmd = `assess form remove --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.key) cmd += ` --key ${opts.key}`;
      cmd += ' --json';
      const result = await execCommand(cmd);
      output(result);
    });

  field
    .command('set-property')
    .description('Fine-grained field property update')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <fieldId>', 'Field ID')
    .option('--key <fieldKey>', 'Field Key')
    .requiredOption('--property <property>', 'Property path (e.g. options.1.score)')
    .requiredOption('--value <value>', 'Property value')
    .action(async (opts) => {
      if (!opts.id && !opts.key) {
        console.error('❌ Either --id or --key is required');
        process.exit(1);
      }
      let cmd = `assess form set-property --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.key) cmd += ` --key ${opts.key}`;
      cmd += ` --property ${opts.property} --value "${opts.value}"`;
      const result = await execCommand(cmd);
      output(result);
    });

  field
    .command('move')
    .description('Move a field to a specific position')
    .requiredOption('--app <appId>', 'App ID')
    .option('--id <fieldId>', 'Field ID')
    .option('--key <fieldKey>', 'Field Key')
    .requiredOption('--pos <pos>', 'Target position (1-based)', parseInt)
    .action(async (opts) => {
      if (!opts.id && !opts.key) {
        console.error('❌ Either --id or --key is required');
        process.exit(1);
      }
      let cmd = `assess form move --app ${opts.app}`;
      if (opts.id) cmd += ` --id ${opts.id}`;
      if (opts.key) cmd += ` --key ${opts.key}`;
      cmd += ` --pos ${opts.pos}`;
      const result = await execCommand(cmd);
      output(result);
    });
}
