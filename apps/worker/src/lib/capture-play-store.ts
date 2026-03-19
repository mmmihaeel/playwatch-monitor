import type { Browser } from 'playwright';
import { chromium } from 'playwright';

import { buildGooglePlayListingUrl } from '@playwatch/shared';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(headless: boolean) {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless
    });
  }

  return browserPromise;
}

async function dismissConsentDialog(page: Awaited<ReturnType<Browser['newPage']>>) {
  const selectors = [
    /Accept all/i,
    /I agree/i,
    /Accept/i
  ];

  for (const selector of selectors) {
    const button = page.getByRole('button', { name: selector }).first();

    try {
      if (await button.isVisible({ timeout: 1_000 })) {
        await button.click();
        return;
      }
    } catch {
      // Best effort only. Different regions can render different consent screens.
    }
  }
}

export async function capturePlayStoreListing(input: {
  packageId: string;
  region: string;
  locale: string;
  headless: boolean;
  timeoutMs: number;
}) {
  const browser = await getBrowser(input.headless);
  const context = await browser.newContext({
    locale: input.locale,
    viewport: { width: 1440, height: 2200 }
  });
  const page = await context.newPage();
  const url = buildGooglePlayListingUrl(input);

  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: input.timeoutMs
    });

    await dismissConsentDialog(page);
    await page.waitForLoadState('networkidle', {
      timeout: 10_000
    }).catch(() => undefined);

    const pageTitle = await page.locator('h1').first().textContent().catch(() => null);
    const buffer = await page.screenshot({
      fullPage: true,
      type: 'png'
    });

    return {
      title: pageTitle?.trim() || input.packageId,
      buffer
    };
  } finally {
    await context.close();
  }
}

export async function closeCaptureBrowser() {
  if (!browserPromise) {
    return;
  }

  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}
