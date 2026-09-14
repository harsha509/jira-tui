#!/usr/bin/env node

const [, , command] = process.argv;

if (command === 'doctor' || command === 'check') {
  const { runDoctor } = await import('../dist/doctor.js');
  process.exit(await runDoctor(process.argv.slice(3)));
} else if (command === '--help' || command === '-h' || command === 'help') {
  process.stdout.write(
    [
      'Usage: jira-tui [--project KEY]      open the TUI (optionally for another project)',
      '       jira-tui doctor [--project KEY]  show where settings come from and check login, project, board',
      '',
      'Settings: JIRA_API_TOKEN (required), JIRA_SERVER, JIRA_LOGIN, JIRA_PROJECT, JIRA_BOARD_ID, JIRA_TEAM;',
      'server/login/project/board also come from jira-cli (~/.config/.jira/.config.yml).',
      '',
    ].join('\n')
  );
} else {
  await import('../dist/index.js');
}
