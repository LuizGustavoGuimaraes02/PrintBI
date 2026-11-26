/**
 * Moves orders from the first eight-column board to the four columns (To do, Printing,
 * Ready, Done). Old "waiting" columns become a flag on the card:
 *
 *   Quote draft, Waiting for customer → To do, flagged "Waiting for quote approval"
 *   Blocked                           → To do, keeping its reason
 *   Printed                           → Ready
 *
 *   npm run migrate:order-stages -w @printbi/api -- --dry   (counts only, changes nothing)
 *   npm run migrate:order-stages -w @printbi/api
 *
 * Safe to run twice: the second run finds nothing to move. History entries keep their old
 * column names.
 */
import mongoose from 'mongoose';

const dry = process.argv.includes('--dry');
const uri = process.env.MONGO_URI;
if (!uri) {
  process.stderr.write('MONGO_URI is not set (it is read from apps/api/.env).\n');
  process.exit(1);
}

await mongoose.connect(uri);
const orders = mongoose.connection.collection('orders');

const steps = [
  {
    label: 'Quote draft / Waiting → To do, flagged',
    filter: { status: { $in: ['quote_draft', 'waiting'] }, blocked: null },
    update: [
      {
        $set: {
          status: 'todo',
          blocked: { reason: 'quote_approval', note: '', since: '$statusEnteredAt' },
        },
      },
    ],
  },
  {
    label: 'Quote draft / Waiting (already flagged) → To do',
    filter: { status: { $in: ['quote_draft', 'waiting'] } },
    update: { $set: { status: 'todo' } },
  },
  {
    label: 'Blocked → To do, keeping the reason',
    filter: { status: 'blocked' },
    update: { $set: { status: 'todo' } },
  },
  {
    label: 'Printed → Ready',
    filter: { status: 'printed' },
    update: { $set: { status: 'ready' } },
  },
];

for (const step of steps) {
  const count = await orders.countDocuments(step.filter);
  if (!dry && count > 0) await orders.updateMany(step.filter, step.update);
  process.stdout.write(`${dry ? '[dry] ' : ''}${step.label}: ${count}\n`);
}
await mongoose.disconnect();
