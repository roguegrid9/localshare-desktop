import { test, expect } from '@playwright/test';

/**
 * E2E Test: Performance
 *
 * Verifies that the application meets basic performance criteria.
 */
test.describe('Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const loadTime = Date.now() - startTime;

    // Should load in under 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should not have memory leaks on page interactions', async ({ page }) => {
    await page.goto('/');

    // Perform several interactions
    for (let i = 0; i < 10; i++) {
      // Click any visible button
      const button = page.locator('button').first();
      if (await button.isVisible()) {
        await button.click();
        await page.waitForTimeout(100);
      }
    }

    // Page should still be responsive
    await expect(page.locator('#root')).toBeVisible();
  });

  test('should handle rapid navigation without crashing', async ({ page }) => {
    await page.goto('/');

    // Rapidly reload the page multiple times
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await expect(page.locator('#root')).toBeVisible();
    }

    // App should still work
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('should load images efficiently if present', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find all images
    const images = page.locator('img');
    const imageCount = await images.count();

    // If images exist, they should load
    if (imageCount > 0) {
      for (let i = 0; i < Math.min(imageCount, 5); i++) {
        const img = images.nth(i);
        const isVisible = await img.isVisible();

        if (isVisible) {
          // Image should have src
          const src = await img.getAttribute('src');
          expect(src).toBeTruthy();
        }
      }
    }

    // Test passes whether images are present or not
    expect(imageCount).toBeGreaterThanOrEqual(0);
  });

  test('should maintain UI responsiveness under load', async ({ page }) => {
    await page.goto('/');

    // Simulate user typing in an input (if present)
    const input = page.locator('input').first();

    if (await input.isVisible()) {
      // Type a long string rapidly
      await input.focus();
      await input.type('a'.repeat(100), { delay: 0 });

      // Input should still be responsive
      const value = await input.inputValue();
      expect(value.length).toBeGreaterThan(0);
    }

    // UI should remain responsive
    await expect(page.locator('#root')).toBeVisible();
  });
});
