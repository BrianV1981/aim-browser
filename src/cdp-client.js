export class AimBrowser {
  constructor(options = {}) {
    this.options = {
      headless: true,
      port: 9222,
      ...options,
    };
  }

  async connect() {
    throw new Error('Not implemented');
  }
}
