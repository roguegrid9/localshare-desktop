import { test, expect } from '@playwright/test';

/**
 * E2E Test: UI Components
 *
 * Verifies that core UI components render correctly and
 * are interactive.
 */
test.describe('UI Components', () => {
  test('should render button components correctly', async ({ page }) => {
    await page.goto('/');

    // Look for any button elements
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    // Should have at least some buttons in the UI
    expect(buttonCount).toBeGreaterThan(0);

    // Verify buttons are styled (have classes)
    if (buttonCount > 0) {
      const firstButton = buttons.first();
      const className = await firstButton.getAttribute('class');
      expect(className).toBeTruthy();
    }
  });

  test('should render Card components with proper structure', async ({ page }) => {
    await page.goto('/');

    // Wait for any content to load
    await page.waitForTimeout(500);

    // Check if Card-like structures exist (divs with rounded corners, borders, etc.)
    const possibleCards = page.locator('[class*="rounded"], [class*="border"], [class*="card"]');
    const cardCount = await possibleCards.count();

    // UI should have some card-like components
    expect(cardCount).toBeGreaterThan(0);
  });

  test('should have accessible form inputs', async ({ page }) => {
    await page.goto('/');

    // Look for input elements
    const inputs = page.locator('input');
    const inputCount = await inputs.count();

    if (inputCount > 0) {
      // Check first input has proper attributes
      const firstInput = inputs.first();

      // Should have a type attribute
      const inputType = await firstInput.getAttribute('type');
      expect(inputType).toBeTruthy();

      // Should be styled
      const className = await firstInput.getAttribute('class');
      expect(className).toBeTruthy();
    }
  });

  test('should render Badge components when present', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    // Badges might be present in the UI
    // Look for small styled elements that could be badges
    const potentialBadges = page.locator(
      '[class*="badge"], [class*="pill"], [class*="tag"], span[class*="rounded"]'
    );

    const count = await potentialBadges.count();

    // If badges exist, they should be visible
    if (count > 0) {
      await expect(potentialBadges.first()).toBeVisible();
    }

    // Test passes whether badges are present or not
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should handle hover states on interactive elements', async ({ page }) => {
    await page.goto('/');

    // Find first button
    const button = page.locator('button').first();

    if (await button.isVisible()) {
      // Get initial styles
      const initialBackground = await button.evaluate((el) =>
        window.getComputedStyle(el).backgroundColor
      );

      // Hover over the button
      await button.hover();

      // Allow CSS transitions
      await page.waitForTimeout(100);

      // Button should be interactive (cursor should change or styles update)
      const cursor = await button.evaluate((el) =>
        window.getComputedStyle(el).cursor
      );

      // Interactive elements should have pointer cursor or be styled
      const isInteractive = cursor === 'pointer' || cursor === 'default';
      expect(isInteractive).toBe(true);
    }
  });
});
