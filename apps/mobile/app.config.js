const fs = require('fs');
const path = require('path');

const GOOGLE_OAUTH_IOS_REDIRECT_SCHEME =
  'com.googleusercontent.apps.1085364770994-t92be8lrnis7ma7o8kqpa3qsiulqbra2';

const MOBILE_ROOT = __dirname;
const WORKSPACE_ROOT = path.resolve(MOBILE_ROOT, '..', '..');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const values = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    if (!key) {
      continue;
    }

    const unquoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;

    values[key] = unquoted;
  }

  return values;
}

const fileEnv = {
  ...parseEnvFile(path.join(WORKSPACE_ROOT, '.env')),
  ...parseEnvFile(path.join(WORKSPACE_ROOT, '.env.local')),
  ...parseEnvFile(path.join(MOBILE_ROOT, '.env')),
  ...parseEnvFile(path.join(MOBILE_ROOT, '.env.local')),
};

function envValue(name) {
  const fromProcess = process.env[name];
  if (typeof fromProcess === 'string' && fromProcess.trim().length > 0) {
    return fromProcess;
  }

  const fromFile = fileEnv[name];
  if (typeof fromFile === 'string' && fromFile.trim().length > 0) {
    return fromFile;
  }

  return '';
}

module.exports = {
  expo: {
    name: 'Mintly',
    slug: 'mintly',
    scheme: 'mintly',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/brand/mintly-icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    packagerOpts: {
      entryPoint: './index.ts',
    },
    splash: {
      image: './assets/brand/mintly-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.mintly.app',
      buildNumber: '1',
      usesAppleSignIn: true,
      infoPlist: {
        NSCameraUsageDescription: 'Camera access is needed to scan receipts.',
        NSPhotoLibraryUsageDescription: 'Photo library access is needed to select receipt images.',
        NSUserNotificationUsageDescription: 'Notifications remind you before upcoming payments are due.',
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: [
              'mintly',
              'com.mintly.app',
              GOOGLE_OAUTH_IOS_REDIRECT_SCHEME,
            ],
          },
        ],
      },
    },
    android: {
      package: 'com.mintly.app',
      versionCode: 1,
      permissions: [
        'android.permission.CAMERA',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.RECORD_AUDIO',
      ],
      adaptiveIcon: {
        foregroundImage: './assets/brand/mintly-adaptive-foreground.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      'expo-apple-authentication',
      'expo-image-picker',
      'expo-notifications',
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme: GOOGLE_OAUTH_IOS_REDIRECT_SCHEME,
        },
      ],
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: 'ca-app-pub-6114268066977057~1007298901',
          iosAppId: 'ca-app-pub-6114268066977057~4699131909',
        },
      ],
    ],
    extra: {
      cameraUsageDescription: 'Camera access is needed to scan receipts.',
      eas: {
        projectId: '965d7b6d-1403-49b0-8479-f23451e62d64',
      },
      EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID:
        envValue('EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID'),
      EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID:
        envValue('EXPO_PUBLIC_GOOGLE_OAUTH_IOS_CLIENT_ID'),
      EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID:
        envValue('EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID'),
      EXPO_PUBLIC_API_BASE_URL: envValue('EXPO_PUBLIC_API_BASE_URL'),
    },
    web: {
      favicon: './assets/brand/mintly-favicon.png',
    },
  },
};
