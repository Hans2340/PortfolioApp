/* ASNB (Amanah Saham Nasional Berhad) unit trust funds.
 * Fixed-price funds always trade at RM1.00 per unit; returns come from yearly
 * income distributions (dividend + bonus), usually reinvested as new units.
 * Variable-price funds have a daily NAV which ASNB publishes (no public API),
 * so their price is entered manually.
 */
(function (root) {
  'use strict';

  const FUNDS = [
    // Fixed price (RM1.00)
    { code: 'ASB', name: 'Amanah Saham Bumiputera', fixed: true },
    { code: 'ASB2', name: 'Amanah Saham Bumiputera 2', fixed: true },
    { code: 'ASB3', name: 'Amanah Saham Bumiputera 3 - Didik', fixed: true },
    { code: 'ASM', name: 'Amanah Saham Malaysia', fixed: true },
    { code: 'ASM2', name: 'Amanah Saham Malaysia 2 - Wawasan', fixed: true },
    { code: 'ASM3', name: 'Amanah Saham Malaysia 3', fixed: true },
    // Variable price (NAV)
    { code: 'ASN', name: 'Amanah Saham Nasional', fixed: false },
    { code: 'ASNE2', name: 'ASN Equity 2', fixed: false },
    { code: 'ASNE3', name: 'ASN Equity 3', fixed: false },
    { code: 'ASNE5', name: 'ASN Equity 5', fixed: false },
    { code: 'ASNEG', name: 'ASN Equity Global', fixed: false },
    { code: 'ASNI1', name: 'ASN Imbang 1', fixed: false },
    { code: 'ASNI2', name: 'ASN Imbang 2', fixed: false },
    { code: 'ASNI3G', name: 'ASN Imbang 3 Global', fixed: false },
    { code: 'ASNS1', name: 'ASN Sara 1', fixed: false },
    { code: 'ASNS2', name: 'ASN Sara 2', fixed: false },
    { code: 'ASNSUKUK', name: 'ASN Sukuk', fixed: false },
  ];

  const FIXED_PRICE = 1;

  function find(code) {
    const c = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
    return FUNDS.find((f) => f.code === c) || null;
  }

  const api = { FUNDS, FIXED_PRICE, find };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ASNB = api;
})(typeof window !== 'undefined' ? window : globalThis);
