import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';
import HybridChannelRepository from './src/infrastructure/repositories/HybridChannelRepository.js';

const config = TVAddonConfig.getInstance();

console.log('=== DEBUG AUTOMÁTICO ===');
console.log('AUTO_M3U_URL:', config.dataSources.autoM3uUrl);
console.log('CHANNELS_SOURCE:', config.dataSources.channelsSource);
console.log('Channels File:', config.dataSources.channelsFile);

const repo = new HybridChannelRepository(config);

console.log('Iniciando prueba de procesamiento automático...');
console.time('Inicialización');

await repo.initialize();

console.timeEnd('Inicialización');
console.log('✅ Inicialización completada');
const channels = repo.getAllChannels();
console.log('Total de canales:', channels?.length || 0);

if (channels && channels.length > 0) {
  if (channels.length <= 10) {
    console.log('Canales:', channels.map(c => `${c.name} - ${c.url}`));
  } else {
    console.log('Primeros 10 canales:', channels.slice(0, 10).map(c => `${c.name} - ${c.url}`));
  }
}