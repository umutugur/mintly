#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:4000').replace(/\/+$/, '');
const password = process.env.SMOKE_PASSWORD ?? 'Password123';
const email = process.env.SMOKE_EMAIL ?? 'demo@finsight.dev';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

async function requestWithResponse(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  return { response, payload };
}

async function main() {
  console.log(`[smoke] baseUrl=${baseUrl}`);
  console.log(`[smoke] email=${email}`);

  let activeEmail = email;
  let activePassword = password;

  const registerResult = await requestWithResponse('/auth/register', {
    method: 'POST',
    body: {
      email: activeEmail,
      password: activePassword,
      name: 'Smoke User',
    },
  });

  const registerCreated = registerResult.response.status === 201;
  const registerExists =
    registerResult.response.status === 409 &&
    registerResult.payload?.error?.code === 'EMAIL_ALREADY_EXISTS';

  if (registerResult.response.status === 201) {
    console.log('[smoke] register=created');
  } else if (registerExists) {
    console.log('[smoke] register=exists');
  } else {
    throw new Error(
      `POST /auth/register failed (${registerResult.response.status}): ${JSON.stringify(registerResult.payload)}`,
    );
  }

  let login = await requestWithResponse('/auth/login', {
    method: 'POST',
    body: {
      email: activeEmail,
      password: activePassword,
    },
  });

  const loginInvalidCredentials =
    login.response.status === 401 && login.payload?.error?.code === 'INVALID_CREDENTIALS';

  if (!login.response.ok && registerExists && loginInvalidCredentials) {
    const fallbackEmail = `smoke+${Date.now()}@finsight.dev`;
    const fallbackPassword = 'Password123';
    console.log(
      `[smoke] existing account credentials did not match. Creating fallback user ${fallbackEmail}`,
    );

    const fallbackRegister = await requestWithResponse('/auth/register', {
      method: 'POST',
      body: {
        email: fallbackEmail,
        password: fallbackPassword,
        name: 'Smoke User',
      },
    });

    if (fallbackRegister.response.status !== 201) {
      throw new Error(
        `POST /auth/register (fallback) failed (${fallbackRegister.response.status}): ${JSON.stringify(fallbackRegister.payload)}`,
      );
    }

    activeEmail = fallbackEmail;
    activePassword = fallbackPassword;

    login = await requestWithResponse('/auth/login', {
      method: 'POST',
      body: {
        email: activeEmail,
        password: activePassword,
      },
    });
  }

  if (!login.response.ok) {
    if (registerExists) {
      console.error(
        '[smoke] login failed for existing account. Set SMOKE_EMAIL/SMOKE_PASSWORD to valid credentials or reset that user.',
      );
    } else if (registerCreated) {
      console.error('[smoke] login failed immediately after register; check API auth flow.');
    }

    throw new Error(
      `POST /auth/login failed (${login.response.status}): ${JSON.stringify(login.payload)}`,
    );
  }

  const accessToken = login.payload?.accessToken;
  if (!accessToken) {
    throw new Error('Missing accessToken from login response');
  }

  const health = await request('/health');
  if (!health?.ok) {
    throw new Error('Health check payload missing ok=true');
  }

  await request('/me', {
    token: accessToken,
  });

  await request('/dashboard/recent', {
    token: accessToken,
  });

  console.log('[smoke] OK');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
