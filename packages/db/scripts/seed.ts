import { readConfig } from '@playwatch/config';

import { closeDatabase, initDatabase } from '../src/client.js';
import { createMonitoredAppsRepository } from '../src/repositories.js';

const config = readConfig();
const database = initDatabase(config.DATABASE_URL);
const monitoredAppsRepository = createMonitoredAppsRepository(database);

async function run() {
  await monitoredAppsRepository.create({
    packageId: 'com.activision.callofduty.shooter',
    sourceUrl: 'https://play.google.com/store/apps/details?id=com.activision.callofduty.shooter',
    region: config.GOOGLE_PLAY_DEFAULT_REGION,
    locale: config.GOOGLE_PLAY_DEFAULT_LOCALE,
    captureFrequencyMinutes: 60,
    captureImmediately: true
  });
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
