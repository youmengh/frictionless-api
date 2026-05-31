/**
 * Manual proxy overrides for tickers without a clean long-term history.
 *
 * Per the agreed behavior: auto-fallback (price-history computation) is the
 * default, but a manual override here TAKES PRECEDENCE when present. These three
 * are seeded from the spec; a full Settings UI to edit them is out of v1 scope.
 */
export interface ProxyOverride {
  longTermReturn: number; // percent
  note: string;
}

export const PROXY_OVERRIDES: Record<string, ProxyOverride> = {
  QQQM: {
    longTermReturn: 19.0,
    note: 'QQQ proxy — same Nasdaq-100 index, data since 1999',
  },
  FNILX: {
    longTermReturn: 13.1,
    note: '5-yr used as estimate; fund launched Sept 2018, no 10-yr history',
  },
  FELG: {
    longTermReturn: 15.86,
    note: 'From 2024 annual prospectus (period ended Dec 31 2024); ticker reorganized Nov 2023',
  },
};
