import { pool, query } from './pool';
import { hashPassword } from '../auth/jwt';

async function seed() {
  // eslint-disable-next-line no-console
  console.log('[seed] creating demo accounts...');

  const demoPatientEmail = 'demo@rapha.health';
  const exists = await query('SELECT id FROM patients WHERE email = $1', [demoPatientEmail]);
  if (exists.rowCount === 0) {
    const hash = await hashPassword('demo1234');
    await query(
      `INSERT INTO patients (name, email, password_hash, diagnosis, care_goals, role, onboarding_done, onboarding_step)
       VALUES ($1,$2,$3,$4,$5,'patient', TRUE, 8)`,
      ['Demo Patient', demoPatientEmail, hash, ['fibromyalgia'], 'Have more good days and fewer flares.'],
    );
    // eslint-disable-next-line no-console
    console.log(`[seed] patient: ${demoPatientEmail} / demo1234`);
  }

  const staffEmail = 'nurse@rapha.health';
  const staffExists = await query('SELECT id FROM patients WHERE email = $1', [staffEmail]);
  if (staffExists.rowCount === 0) {
    const hash = await hashPassword('staff1234');
    await query(
      `INSERT INTO patients (name, email, password_hash, role, onboarding_done)
       VALUES ($1,$2,$3,'staff', TRUE)`,
      ['HNaaS Specialist (RN)', staffEmail, hash],
    );
    // eslint-disable-next-line no-console
    console.log(`[seed] staff:   ${staffEmail} / staff1234`);
  }

  // eslint-disable-next-line no-console
  console.log('[seed] done.');
  await pool.end();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', err);
  process.exit(1);
});
