test('calculatePromoDiscount handles undefined discountMeta gracefully', () => {
  const result = calculatePromoDiscount(100, 'TEST', undefined);
  assert.strictEqual(result, 0);
});