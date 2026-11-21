test('calculatePromoDiscount handles undefined discountMeta safely', () => {
  const result = calculatePromoDiscount(100, 'PULSE10', undefined);
  assert.strictEqual(result, 10);
});