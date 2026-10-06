import { Command } from 'commander';
import { execCommand } from '../exec.js';
import { output, localFail } from '../output.js';

/**
 * Skill Command — Fetch SKILL.md Domain Knowledge
 *
 * Returns the full SKILL.md content for a given skill module. These are the same
 * skill documents that newapp.html's AssessAgent/BuilderAgent loads internally to
 * enforce P0/P1/P2 constraints when generating CLI commands.
 *
 * AI agents should read the relevant skill document BEFORE constructing commands
 * to ensure they follow all domain constraints.
 *
 * Available skills: form, scale, connect, report, expert, share
 */
export function registerSkillCommand(parent: Command): void {
  parent
    .command('skill')
    .description('Get SKILL.md domain knowledge for a skill module (form/scale/connect/report/expert/share)')
    .argument('<skillId>', 'Skill ID: form / scale / connect / report / expert / share')
    .action(async (skillId: string) => {
      const valid = ['form', 'scale', 'connect', 'report', 'expert', 'share'];
      if (!valid.includes(skillId)) {
        localFail(`Invalid skill ID "${skillId}". Valid: ${valid.join(', ')}`);
      }
      const cmd = `assess skill ${skillId}`;
      const result = await execCommand(cmd);
      output(result);
    });
}
