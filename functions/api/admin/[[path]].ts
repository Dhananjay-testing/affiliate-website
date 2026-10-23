import { handleAdminApi } from '../../_shared/admin-api';
import { handleGitHubOAuth } from '../../_shared/github-oauth';
import type { PagesHandler } from '../../_shared/types';

export const onRequest: PagesHandler = async (context) => {
  const oauthResponse = await handleGitHubOAuth(context);
  return oauthResponse ?? handleAdminApi(context);
};
