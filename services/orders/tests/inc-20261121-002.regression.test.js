test('calculatePromoDiscount handles undefined discountMeta without throwing', () => {
  const result = calculatePromoDiscount(100, 'PULSE10', undefined);
  assert.strictEqual(result, 10);
});