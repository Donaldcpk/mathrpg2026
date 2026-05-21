/**
 * @deprecated Use the project sync tool instead:
 *   node tools/sync_question_answers_from_csv.mjs
 *
 * Rebuilds questionDatabase.js from S1–S3 Answer Key CSVs.
 * Keeps only questions with PNG on disk + CSV answer (TSA: image + valid C_A).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const script = path.join(__dirname, '../../tools/sync_question_answers_from_csv.mjs');
const home = process.env.HOME || '';
const args = [
    script,
    '--csv-s1',
    path.join(home, 'Downloads/Answer Key S1-3 - S1ANS01-12.csv'),
    '--csv-s2',
    path.join(home, 'Downloads/Answer Key S1-3 - S2ANS01-12.csv'),
    '--csv-s3',
    path.join(home, 'Downloads/Answer Key S1-3 - S3ANS01-12.csv'),
    '--db',
    path.join(__dirname, 'questionDatabase.js'),
    '--pictures',
    path.join(__dirname, '../../img/pictures')
];

const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(r.status ?? 1);
