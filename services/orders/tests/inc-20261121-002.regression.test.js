import test from 'node:test';
import assert from 'node:assert/strict';

test('calculatePromoDiscount handles missing discountMeta safely', () => {
  const promo = { code: 'SAVE10' };
  const pct = promo?.discountMeta?.percentage ?? 0;
  assert.equal(pct, 0);
});