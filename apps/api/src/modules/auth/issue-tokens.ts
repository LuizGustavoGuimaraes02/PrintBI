import type { Types } from 'mongoose';
import type { IssuedTokens } from '../../core/auth/cookies';
import { randomToken, signAccessToken } from '../../core/auth/tokens';

export async function issueTokens(
  userId: Types.ObjectId,
  sessionId: Types.ObjectId,
  companyId: Types.ObjectId | null,
  refreshToken?: string,
): Promise<IssuedTokens> {
  const accessToken = await signAccessToken({
    sub: userId.toString(),
    sid: sessionId.toString(),
    cid: companyId?.toString() ?? null,
  });
  return { accessToken, csrfToken: randomToken(), ...(refreshToken && { refreshToken }) };
}
