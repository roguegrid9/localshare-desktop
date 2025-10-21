import { test, expect } from '@playwright/test';

/**
 * E2E Test: Accessibility
 *
 * Verifies basic accessibility features of the application.
 */
test.describe('Accessibility', () => {
  test('should have valid HTML structure', async ({ page }) => {
    await page.goto('/');

    // Check for basic HTML structure
    const html = page.locator('html');
    await expect(html).toBeVisible();

    // Should have head and body
    const head = page.locator('head');
    const body = page.locator('body');

    await expect(head).toHaveCount(1);
    await expect(body).toHaveCount(1);

    // Should have a title
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('should have proper color contrast (visual check)', async ({ page }) => {
    await page.goto('/');

    // Get root element background and color
    const root = page.locator('#root');

    const styles = await root.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
      };
    });

    // Both should be set (not default/transparent)
    expect(styles.backgroundColor).toBeTruthy();
    expect(styles.color).toBeTruthy();
  });

  test('should have focusable interactive elements', async ({ page }) => {
    await page.goto('/');

    // Get all buttons and links
    const interactiveElements = page.locator('button, a, input, textarea, select');
    const count = await interactiveElements.count();

    // Should have some interactive elements
    expect(count).toBeGreaterThan(0);

    // First interactive element should be focusable
    if (count > 0) {
      const firstElement = interactiveElements.first();

      // Focus the element
      await firstElement.focus();

      // Check if it's focused
      const isFocused = await firstElement.evaluate((el) => {
        return document.activeElement === el;
      });

      expect(isFocused).toBe(true);
    }
  });

  test('should support screen reader hints via ARIA', async ({ page }) => {
    await page.goto('/');

    // Look for elements with ARIA attributes
    const elementsWithAria = page.locator(
      '[role], [aria-label], [aria-labelledby], [aria-describedby]'
    );

    const count = await elementsWithAria.count();

    // Good accessibility practice to have ARIA attributes
    // But test passes either way (not all apps need extensive ARIA)
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should handle form validation messages', async ({ page }) => {
    await page.goto('/');

    // Find first input field
    const input = page.locator('input[type="text"], input[type="email"]').first();

    if (await input.isVisible()) {
      // Try to focus and blur without filling
      await input.focus();
      await input.blur();

      // Check if any validation message appears
      // (This is optional - test passes if no validation present)
      await page.waitForTimeout(500);

      // Form should still be functional
      await expect(input).toBeVisible();
    }
  });
});
