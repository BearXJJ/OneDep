export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const SESSION_COOKIE_NAME = IS_PRODUCTION
  ? '__Host-onedep_session'
  : 'onedep_session';
