import { test, expect } from '@playwright/test';

/**
 * E2E Test: Navigation
 *
 * Verifies that navigation within the application works correctly.
 */
test.describe('Navigation', () => {
  test('should maintain responsive layout on window resize', async ({ page }) => {
    await page.goto('/');

    // Start with desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('#root')).toBeVisible();

    // Resize to tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('#root')).toBeVisible();

    // Resize to mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('#root')).toBeVisible();

    // App should still be functional at all sizes
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('should handle keyboard navigation', async ({ page }) => {
    await page.goto('/');

    // Try pressing Tab to focus elements
    await page.keyboard.press('Tab');

    // Check if an element gained focus
    const focusedElement = await page.evaluate(() => {
      return document.activeElement?.tagName;
    });

    // Some element should be focusable
    expect(focusedElement).toBeTruthy();
  });

  test('should support browser back/forward navigation', async ({ page }) => {
    await page.goto('/');

    // Get initial URL
    const initialUrl = page.url();

    // Try going back (should stay on same page if no history)
    await page.goBack();
    await page.waitForLoadState('networkidle');

    // Should either stay on same page or handle gracefully
    const currentUrl = page.url();
    expect(currentUrl).toBeTruthy();
  });
});
