// Share links. With EXPO_PUBLIC_LINK_BASE (e.g. https://docketapp.tech) they open a small page that hands
// off to the app; without it they use the app's own scheme. Universal links wait for a native rebuild.
const BASE = process.env.EXPO_PUBLIC_LINK_BASE?.replace(/\/$/, '');

const link = (path: string) => (BASE ? `${BASE}/${path}` : `docket://${path}`);

export const inviteLink = (token: string, via?: 'qr') => link(`invite/${token}${via ? '?via=qr' : ''}`);
export const groupLink = (code: string) => link(`group/${code}`);
/** Appended to spoiler-free share text. */
export const homeLink = BASE ?? undefined;
