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

  const existing = user.expoPushTokens.find(
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

  if (existing) {
    existing.device = input.device ?? null;
    existing.platform = input.platform ?? existing.platform ?? null;
    existing.deviceInfo = input.deviceInfo ?? null;
    existing.lastUsedAt = now;
    existing.updatedAt = now;
  } else {
    user.expoPushTokens.push({
      token: nextToken,
      device: input.device ?? null,
      platform: input.platform ?? null,
      deviceInfo: input.deviceInfo ?? null,
      createdAt: now,
      lastUsedAt: now,
      updatedAt: now,
    });
  }

  await user.save();

  return {
    tokensCount: user.expoPushTokens.length,
    reusedExisting: Boolean(existing),
    tokenUpdatedAt: now,
  };
}
