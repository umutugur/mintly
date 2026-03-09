import { ApiError } from '../errors.js';
import { UserModel } from '../models/User.js';

export interface RegisterUserExpoPushTokenInput {
  userId: string;
  expoPushToken: string;
  platform?: 'ios' | 'android';
  device?: string | null;
  deviceInfo?: Record<string, unknown> | null;
}

export interface RegisterUserExpoPushTokenResult {
  tokensCount: number;
  reusedExisting: boolean;
  tokenUpdatedAt: Date;
}

export async function registerUserExpoPushToken(
  input: RegisterUserExpoPushTokenInput,
): Promise<RegisterUserExpoPushTokenResult> {
  const user = await UserModel.findById(input.userId).select('_id expoPushTokens');
  if (!user) {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      message: 'User not found',
      statusCode: 401,
    });
  }

  const nextToken = input.expoPushToken.trim();
  const now = new Date();
  if (!nextToken) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: 'Push token is required',
      statusCode: 400,
    });
  }

  if (!Array.isArray(user.expoPushTokens)) {
    user.expoPushTokens = [];
  }

  await UserModel.updateMany(
    {
      _id: { $ne: user._id },
      'expoPushTokens.token': nextToken,
    },
    {
      $pull: {
        expoPushTokens: {
          token: nextToken,
        },
      },
    },
  );

  const existingMatches = user.expoPushTokens.filter(
    (item: {
      token: string;
      device?: string | null;
      platform?: 'ios' | 'android' | null;
      deviceInfo?: Record<string, unknown> | null;
      createdAt?: Date;
      lastUsedAt?: Date;
      updatedAt?: Date;
    }) => item.token === nextToken,
  );
  const existing = existingMatches[0];
  const nextEntry = {
    token: nextToken,
    device: input.device ?? existing?.device ?? null,
    platform: input.platform ?? existing?.platform ?? null,
    deviceInfo: input.deviceInfo ?? existing?.deviceInfo ?? null,
    createdAt: existing?.createdAt ?? now,
    lastUsedAt: now,
    updatedAt: now,
  };

  user.expoPushTokens = [nextEntry];

  await user.save();

  return {
    tokensCount: user.expoPushTokens.length,
    reusedExisting: existingMatches.length > 0,
    tokenUpdatedAt: now,
  };
}
