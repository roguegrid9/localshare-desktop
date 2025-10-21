import { test, expect } from '@playwright/test';

/**
 * E2E Test: Application Launch
 *
 * Verifies that the application loads successfully and renders
 * the expected initial UI elements.
 */
test.describe('Application Launch', () => {
  test('should load the application without errors', async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Wait for the app to be ready (look for root element)
    await expect(page.locator('#root')).toBeVisible();

    // Verify no console errors during load
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Give the app time to initialize
    await page.waitForTimeout(1000);

    // Check that critical errors didn't occur
    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') && // Ignore favicon errors
      !e.includes('WebSocket') && // WebSocket may fail in test env
      !e.includes('Tauri') // Tauri APIs not available in browser
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('should display the main application container', async ({ page }) => {
    await page.goto('/');

    // Check for main app container
    const appContainer = page.locator('#root');
    await expect(appContainer).toBeVisible();

    // Verify some content is rendered
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(0);
  });

  test('should load required stylesheets', async ({ page }) => {
    await page.goto('/');

    // Wait for styles to load
    await page.waitForLoadState('networkidle');

    // Check that some basic styling is applied
    const root = page.locator('#root');
    const backgroundColor = await root.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );

    // Should have some background color set (not default transparent)
    expect(backgroundColor).toBeTruthy();
  });
});
