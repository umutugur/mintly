type UserNameSource = {
  fullName?: string | null;
  name?: string | null;
  surname?: string | null;
  email?: string | null;
};

function clean(value?: string | null): string {
  return value?.trim() ?? '';
}

export function resolveUserDisplayName(user: UserNameSource | null | undefined): string {
  if (!user) {
    return '—';
  }

  const fullName = clean(user.fullName);
  if (fullName) {
    return fullName;
  }

  const name = clean(user.name);
  const surname = clean(user.surname);
  const combined = [name, surname].filter(Boolean).join(' ').trim();
  if (combined) {
    return combined;
  }

  const email = clean(user.email);
  if (email.includes('@')) {
    const prefix = email.split('@')[0]?.trim();
    if (prefix) {
      return prefix;
    }
  }

  return '—';
}
