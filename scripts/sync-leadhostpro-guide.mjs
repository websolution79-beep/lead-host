import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const guide = JSON.parse(await readFile(new URL('src/lib/marketing/leadhostpro-guide.json', root), 'utf8'));
const lines = [`# ${guide.title}`, '', guide.description, ''];
for (const section of guide.sections) {
  lines.push(`## ${section.title}`, '');
  for (const paragraph of section.paragraphs ?? []) lines.push(paragraph, '');
  if (section.bullets) lines.push(...section.bullets.map(item => `- ${item}`), '');
  if (section.steps) lines.push(...section.steps.map((item, index) => `${index + 1}. ${item}`), '');
  if (section.table) lines.push(`| ${section.table.headers.join(' | ')} |`, `| ${section.table.headers.map(() => '---').join(' | ')} |`, ...section.table.rows.map(row => `| ${row.join(' | ')} |`), '');
}
const content = `${lines.join('\n').trimEnd()}\n`;
const target = new URL('docs/systeme-client-setup.md', root);
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')).replaceAll('\r\n', '\n') !== content) {
    throw new Error('Client guide differs from the in-app source. Run node scripts/sync-leadhostpro-guide.mjs.');
  }
  console.log('Client guide matches the in-app LeadHostPro source.');
} else {
  await writeFile(target, content);
  console.log('Generated docs/systeme-client-setup.md from the in-app guide.');
}
