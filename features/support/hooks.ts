import { After, AfterAll, Before, BeforeAll, setDefaultTimeout } from '@cucumber/cucumber';
import { excerpt } from '../../src/client/apiClient';
import { config } from '../../src/config';
import { OpenMeteoStub } from '../../src/stubs/openMeteoStub';

setDefaultTimeout(15_000);

export const stub = new OpenMeteoStub(config.stubPort);

BeforeAll(async () => {
  await stub.start();
  if (process.env.CUCUMBER_VERBOSE_STUB !== '0')
    console.log(
      `[stub] Open-Meteo stub on ${stub.baseUrl}; start the API with OPEN_METEO_*_BASE_URL=${stub.baseUrl} ` +
        `and CLOCK_NOW=${config.referenceNow}`,
    );
});

AfterAll(async () => {
  await stub.stop();
});

Before(() => {
  stub.reset();
});

After(function (scenario) {
  if (scenario.result?.status === 'FAILED' && this.response) {
    const r = this.response;
    this.attach(
      `Last API response: HTTP ${r.status}, Content-Type "${r.contentType}", ${r.durationMs} ms\n` +
        excerpt(r.rawBody, 2000),
      'text/plain',
    );
  }
});
