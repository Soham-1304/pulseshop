test('calculatePromoDiscount handles undefined discountMeta gracefully', () => {
  const result = calculatePromoDiscount(100, 'PULSE10', undefined);
  assert.strictEqual(result, 10);
});