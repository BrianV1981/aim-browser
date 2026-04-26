import { AimBrowser } from '../src/cdp-client.js';

describe('AimBrowser Core Engine', () => {
  it('should initialize with default options', () => {
    const browser = new AimBrowser();
    expect(browser).toBeDefined();
    expect(browser.options.headless).toBe(true);
  });

  it('should allow overriding options', () => {
    const browser = new AimBrowser({ headless: false, port: 9222 });
    expect(browser.options.headless).toBe(false);
    expect(browser.options.port).toBe(9222);
  });
});
