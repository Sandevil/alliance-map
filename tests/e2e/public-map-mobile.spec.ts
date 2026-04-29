import { expect, test } from '@playwright/test';

test('mobile public map diagnostics: grid position, tap, and player centering', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('app-map-board')).toBeVisible();

  const metricsBefore = await page.evaluate(() => {
    const viewport = document.querySelector('.board__viewport') as HTMLElement | null;
    const grid = document.querySelector('.grid') as HTMLElement | null;
    if (!viewport || !grid) {
      return null;
    }

    const vr = viewport.getBoundingClientRect();
    const gr = grid.getBoundingClientRect();
    return {
      viewportTop: vr.top,
      viewportBottom: vr.bottom,
      gridTop: gr.top,
      gridBottom: gr.bottom,
      verticalDeltaTop: gr.top - vr.top,
      verticalDeltaBottom: vr.bottom - gr.bottom,
    };
  });

  expect(metricsBefore).not.toBeNull();
  console.log('metricsBefore', metricsBefore);

  const firstCell = page.locator('.grid__cell').first();
  await firstCell.click({ force: true });
  await expect(page.locator('.board__meta p')).toContainText('Internal:');

  const firstSearchResult = page.locator('.public-search__results button').first();
  if ((await firstSearchResult.count()) > 0) {
    await firstSearchResult.click();
    await page.waitForTimeout(350);
  }

  const metricsAfter = await page.evaluate(() => {
    const viewport = document.querySelector('.board__viewport') as HTMLElement | null;
    const highlighted = document.querySelector('.grid__tile--highlight') as HTMLElement | null;
    const fallbackCity = document.querySelector('.grid__tile[data-player-id]') as HTMLElement | null;
    const target = highlighted ?? fallbackCity;

    if (!viewport || !target) {
      return null;
    }

    const vr = viewport.getBoundingClientRect();
    const hr = target.getBoundingClientRect();
    const centerX = hr.left + hr.width / 2;
    const centerY = hr.top + hr.height / 2;

    return {
      usedHighlight: !!highlighted,
      viewportCenterX: vr.left + vr.width / 2,
      viewportCenterY: vr.top + vr.height / 2,
      highlightedCenterX: centerX,
      highlightedCenterY: centerY,
      dx: centerX - (vr.left + vr.width / 2),
      dy: centerY - (vr.top + vr.height / 2),
      insideViewport:
        hr.left >= vr.left && hr.right <= vr.right && hr.top >= vr.top && hr.bottom <= vr.bottom,
    };
  });

  await page.screenshot({ path: 'test-results/public-mobile-diagnostic.png', fullPage: true });

  if (metricsAfter) {
    console.log('metricsAfter', metricsAfter);
  } else {
    console.log('metricsAfter', { skipped: true, reason: 'No highlighted or city tile found in current dataset' });
  }
});
