// Deliberate manual step, not an API endpoint: promoting a user to ADMIN
// grants access to every /admin/* route (dealer verification, audit log,
// dashboard counts — see src/modules/admin), so it stays a one-off script
// run by whoever controls the database, not something reachable over HTTP.
// The user must already exist — sign up once through the normal OTP flow
// with the phone number you're about to promote, then run this.
//
// Usage: npm run promote:admin -- +9665XXXXXXXX
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const phone = process.argv[2];
  if (!phone) {
    console.error('Usage: npm run promote:admin -- <phone>');
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    console.error(`No user found with phone ${phone} — they must sign up (OTP login) first.`);
    process.exitCode = 1;
    return;
  }

  await prisma.user.update({ where: { phone }, data: { role: 'ADMIN' } });
  console.log(`${phone} is now ADMIN. They'll need to log in again for a fresh JWT carrying the new role.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
