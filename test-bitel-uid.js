/**
 * Script de prueba para verificar el funcionamiento del BitelUidService
 * Prueba la generación de UIDs dinámicos para canales TV360.BITEL
 */

import { BitelUidService } from './src/infrastructure/services/BitelUidService.js';

// Configuración de prueba
const testConfig = {
  streaming: {
    defaultQuality: '720p'
  }
};

const logger = {
  debug: (msg) => console.log(`[DEBUG] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  info: (msg) => console.log(`[INFO] ${msg}`)
};

// Crear instancia del servicio
const bitelService = new BitelUidService(testConfig, logger);

// URLs de prueba de TV360.BITEL
const testUrls = [
  'https://tv360.bitel.com.pe/live/stream1.m3u8',
  'https://tv360.bitel.com.pe/live/stream2.m3u8?uid=',
  'https://tv360.bitel.com.pe/live/stream3.m3u8?uid=123',
  'https://tv360.bitel.com.pe/live/stream4.m3u8?quality=720p',
  'https://other-provider.com/stream.m3u8', // No BITEL
];

const testChannelIds = [
  'tv_bitel_channel_1',
  'tv_bitel_channel_2', 
  'tv_bitel_channel_3',
  'tv_bitel_channel_4',
  'tv_other_channel'
];

console.log('=== PRUEBA DEL BITEL UID SERVICE ===\n');

// Probar procesamiento de URLs
testUrls.forEach((url, index) => {
  const channelId = testChannelIds[index];
  console.log(`\n--- Prueba ${index + 1} ---`);
  console.log(`URL Original: ${url}`);
  console.log(`Canal ID: ${channelId}`);
  
  const processedUrl = bitelService.processStreamUrl(url, channelId);
  console.log(`URL Procesada: ${processedUrl}`);
  
  const isBitel = url.includes('tv360.bitel.com.pe');
  const wasModified = url !== processedUrl;
  
  console.log(`Es canal BITEL: ${isBitel}`);
  console.log(`URL modificada: ${wasModified}`);
  
  if (isBitel && wasModified) {
    // Extraer UID de la URL procesada
    const uidMatch = processedUrl.match(/uid=([^&]+)/);
    if (uidMatch) {
      console.log(`UID generado: ${uidMatch[1]}`);
      console.log(`Longitud UID: ${uidMatch[1].length} caracteres`);
    }
  }
});

// Probar cache
console.log('\n=== PRUEBA DE CACHE ===\n');

const testChannelId = 'tv_bitel_test';
const testUrl = 'https://tv360.bitel.com.pe/live/test.m3u8';

console.log('Primera llamada (debería generar nuevo UID):');
const firstCall = bitelService.processStreamUrl(testUrl, testChannelId);
console.log(`URL: ${firstCall}`);

console.log('\nSegunda llamada inmediata (debería usar cache):');
const secondCall = bitelService.processStreamUrl(testUrl, testChannelId);
console.log(`URL: ${secondCall}`);

console.log(`\nURLs iguales (cache funcionando): ${firstCall === secondCall}`);

// Verificar estadísticas
console.log('\n=== ESTADÍSTICAS DEL SERVICIO ===\n');
const stats = bitelService.getStats();
console.log('Estadísticas:', JSON.stringify(stats, null, 2));

// Verificar si canal está en cache
console.log(`\nCanal en cache: ${bitelService.isChannelCached(testChannelId)}`);

console.log('\n=== PRUEBA COMPLETADA ===');