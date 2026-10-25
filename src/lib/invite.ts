/** Universal links wait for a domain; until then the app's own scheme opens the invite. */
export const inviteLink = (token: string, via?: 'qr') => `docket://invite/${token}${via ? '?via=qr' : ''}`;
