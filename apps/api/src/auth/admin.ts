import { hashPassword } from './passwords.js';
import { UserModel } from '../models/User.js';

const BOOTSTRAP_ADMIN_EMAIL = 'admin@montly.app';
const BOOTSTRAP_ADMIN_PASSWORD = 'ChangeMeImmediately#2026';
const BOOTSTRAP_ADMIN_NAME = 'Montly Admin';

export async function ensureBootstrapAdmin(): Promise<void> {
  const existingAdmin = await UserModel.exists({ role: 'admin' });

  if (existingAdmin) {
    console.info('Admin account already exists');
    return;
  }

  const existingByEmail = await UserModel.findOne({ email: BOOTSTRAP_ADMIN_EMAIL }).select('_id role');

  if (existingByEmail && existingByEmail.role !== 'admin') {
    throw new Error(
      `Cannot bootstrap admin because ${BOOTSTRAP_ADMIN_EMAIL} is already used by a non-admin account.`,
    );
  }

  const passwordHash = await hashPassword(BOOTSTRAP_ADMIN_PASSWORD);

  await UserModel.create({
    email: BOOTSTRAP_ADMIN_EMAIL,
    name: BOOTSTRAP_ADMIN_NAME,
    role: 'admin',
    notificationsEnabled: false,
    passwordHash,
  });

  console.info(`Admin account created: ${BOOTSTRAP_ADMIN_EMAIL}`);
}
