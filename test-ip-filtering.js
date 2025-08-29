/**
 * Script de prueba para el sistema de filtrado de IPs específicas
 * 
 * Este script demuestra cómo usar las nuevas funcionalidades de filtrado
 * de IPs en el sistema de canales prohibidos.
 */

import {
  addBannedIP,
  addBannedIPRange,
  removeBannedIP,
  removeBannedIPRange,
  getBannedIPs,
  getBannedIPRanges,
  isIPBanned,
  isChannelURLBanned,
  extractIPFromURL,
  filterBannedChannels
} from './src/config/banned-channels.js';

console.log('=== Prueba del Sistema de Filtrado de IPs ===\n');

// 1. Mostrar IPs y rangos prohibidos por defecto
console.log('1. IPs prohibidas por defecto:');
console.log(getBannedIPs());
console.log('\nRangos CIDR prohibidos por defecto:');
console.log(getBannedIPRanges());

// 2. Agregar nuevas IPs prohibidas
console.log('\n2. Agregando nuevas IPs prohibidas...');
const testIPs = ['203.0.113.1', '198.51.100.50', '192.0.2.100'];

testIPs.forEach(ip => {
  const result = addBannedIP(ip);
  console.log(`  ${ip}: ${result ? 'Agregada exitosamente' : 'Error al agregar'}`);
});

// Intentar agregar una IP inválida
const invalidIP = '999.999.999.999';
const invalidResult = addBannedIP(invalidIP);
console.log(`  ${invalidIP}: ${invalidResult ? 'Agregada' : 'Rechazada (IP inválida)'}`);

// 3. Agregar rangos CIDR
console.log('\n3. Agregando rangos CIDR prohibidos...');
const testRanges = ['203.0.113.0/24', '198.51.100.0/24'];

testRanges.forEach(range => {
  const result = addBannedIPRange(range);
  console.log(`  ${range}: ${result ? 'Agregado exitosamente' : 'Error al agregar'}`);
});

// 4. Verificar IPs prohibidas
console.log('\n4. Verificando IPs prohibidas...');
const testCheckIPs = [
  '127.0.0.1',        // Prohibida por defecto
  '203.0.113.1',      // Agregada manualmente
  '203.0.113.50',     // En rango CIDR agregado
  '8.8.8.8',          // No prohibida
  '192.168.1.100'     // En rango privado prohibido
];

testCheckIPs.forEach(ip => {
  const isBanned = isIPBanned(ip);
  console.log(`  ${ip}: ${isBanned ? 'PROHIBIDA' : 'Permitida'}`);
});

// 5. Probar extracción de IPs de URLs
console.log('\n5. Extrayendo IPs de URLs...');
const testURLs = [
  'http://203.0.113.1:8080/stream.m3u8',
  'https://192.168.1.50/playlist.m3u',
  'http://example.com/stream',
  'https://8.8.8.8/test',
  'invalid-url'
];

testURLs.forEach(url => {
  const extractedIP = extractIPFromURL(url);
  const isBanned = isChannelURLBanned(url);
  console.log(`  ${url}`);
  console.log(`    IP extraída: ${extractedIP || 'Ninguna'}`);
  console.log(`    URL prohibida: ${isBanned ? 'SÍ' : 'NO'}`);
});

// 6. Filtrar canales con IPs prohibidas
console.log('\n6. Filtrando canales con IPs prohibidas...');
const testChannels = [
  {
    name: 'Canal Test 1',
    url: 'http://203.0.113.1:8080/stream.m3u8'
  },
  {
    name: 'Canal Test 2',
    url: 'https://example.com/stream'
  },
  {
    name: 'Canal Test 3',
    url: 'http://192.168.1.50/playlist.m3u'
  },
  {
    name: 'Canal Válido',
    url: 'https://cdn.example.com/stream.m3u8'
  },
  {
    name: 'ADULT Channel',  // Prohibido por nombre
    url: 'https://valid-ip.com/stream'
  }
];

console.log('Canales originales:', testChannels.length);
const filteredChannels = filterBannedChannels(testChannels);
console.log('Canales después del filtrado:', filteredChannels.length);

console.log('\nCanales filtrados:');
filteredChannels.forEach((channel, index) => {
  console.log(`  ${index + 1}. ${channel.name} - ${channel.url}`);
});

// 7. Remover IPs y rangos
console.log('\n7. Removiendo IPs y rangos de prueba...');
testIPs.forEach(ip => {
  const result = removeBannedIP(ip);
  console.log(`  Removiendo ${ip}: ${result ? 'Exitoso' : 'Error'}`);
});

testRanges.forEach(range => {
  const result = removeBannedIPRange(range);
  console.log(`  Removiendo ${range}: ${result ? 'Exitoso' : 'Error'}`);
});

// 8. Estado final
console.log('\n8. Estado final del sistema:');
console.log('IPs prohibidas:', getBannedIPs());
console.log('Rangos CIDR prohibidos:', getBannedIPRanges());

console.log('\n=== Prueba completada ===');