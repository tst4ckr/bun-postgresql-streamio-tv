/**
 * Script de prueba para el sistema de filtrado configurable desde variables de entorno
 * 
 * Este script demuestra cómo configurar y usar todas las funcionalidades
 * de filtrado desde el archivo .env
 */

// Configurar variables de entorno para la prueba
process.env.BANNED_IPS = '203.0.113.1,198.51.100.50';
process.env.BANNED_IP_RANGES = '203.0.113.0/24,198.51.100.0/24';
process.env.BANNED_URLS = 'http://malicious-server.com,https://spam-iptv.net';
process.env.BANNED_DOMAINS = 'malicious-domain.com,spam-iptv.net';
process.env.CUSTOM_BANNED_TERMS = 'test,demo,sample';
process.env.BANNED_PATTERNS = '.*prueba.*,.*testing.*';

import {
  // Funciones de obtención de configuración
  getBannedIPs,
  getBannedIPRanges,
  getBannedURLs,
  getBannedDomains,
  getCustomBannedTerms,
  getBannedPatterns,
  
  // Funciones de validación
  isIPBanned,
  isChannelURLBanned,
  isDomainBanned,
  isURLBanned,
  isChannelNameContainingCustomTerms,
  isChannelNameMatchingPatterns,
  isChannelBannedByAnyReason,
  
  // Función principal de filtrado
  filterBannedChannels,
  
  // Funciones de gestión dinámica
  addBannedURL,
  addBannedDomain,
  addCustomBannedTerm,
  addBannedPattern
} from './src/config/banned-channels.js';

console.log('=== Prueba del Sistema de Filtrado Configurable desde .env ===\n');

// 1. Mostrar configuración cargada desde variables de entorno
console.log('1. Configuración cargada desde variables de entorno:');
console.log('IPs prohibidas:', getBannedIPs());
console.log('Rangos CIDR prohibidos:', getBannedIPRanges());
console.log('URLs prohibidas:', getBannedURLs());
console.log('Dominios prohibidos:', getBannedDomains());
console.log('Términos personalizados:', getCustomBannedTerms());
console.log('Patrones regex:', getBannedPatterns());

// 2. Probar filtrado por IPs (configuradas desde .env)
console.log('\n2. Probando filtrado por IPs configuradas:');
const testIPs = ['203.0.113.1', '203.0.113.50', '198.51.100.25', '8.8.8.8'];
testIPs.forEach(ip => {
  const banned = isIPBanned(ip);
  console.log(`  ${ip}: ${banned ? 'PROHIBIDA' : 'Permitida'}`);
});

// 3. Probar filtrado por URLs
console.log('\n3. Probando filtrado por URLs configuradas:');
const testURLs = [
  'http://malicious-server.com/stream',
  'https://spam-iptv.net/playlist.m3u',
  'https://legitimate-server.com/stream',
  'http://203.0.113.1:8080/stream'
];
testURLs.forEach(url => {
  const bannedByURL = isURLBanned(url);
  const bannedByIP = isChannelURLBanned(url);
  console.log(`  ${url}`);
  console.log(`    Prohibida por URL: ${bannedByURL ? 'SÍ' : 'NO'}`);
  console.log(`    Prohibida por IP: ${bannedByIP ? 'SÍ' : 'NO'}`);
});

// 4. Probar filtrado por dominios
console.log('\n4. Probando filtrado por dominios configurados:');
const testDomains = [
  'malicious-domain.com',
  'sub.malicious-domain.com',
  'spam-iptv.net',
  'legitimate-domain.com'
];
testDomains.forEach(domain => {
  const banned = isDomainBanned(domain);
  console.log(`  ${domain}: ${banned ? 'PROHIBIDO' : 'Permitido'}`);
});

// 5. Probar filtrado por términos personalizados
console.log('\n5. Probando filtrado por términos personalizados:');
const testChannelNames = [
  'Canal Test HD',
  'Demo Channel',
  'Sample Stream',
  'Canal Normal',
  'ESPN HD'
];
testChannelNames.forEach(name => {
  const banned = isChannelNameContainingCustomTerms(name);
  console.log(`  "${name}": ${banned ? 'PROHIBIDO' : 'Permitido'}`);
});

// 6. Probar filtrado por patrones regex
console.log('\n6. Probando filtrado por patrones regex:');
const testPatternNames = [
  'Canal de Prueba',
  'Testing Channel',
  'Canal Normal',
  'Stream de Testing'
];
testPatternNames.forEach(name => {
  const banned = isChannelNameMatchingPatterns(name);
  console.log(`  "${name}": ${banned ? 'PROHIBIDO' : 'Permitido'}`);
});

// 7. Probar filtrado completo de canales
console.log('\n7. Probando filtrado completo de canales:');
const testChannels = [
  {
    name: 'Canal Normal',
    url: 'https://legitimate-server.com/stream1'
  },
  {
    name: 'Canal Test',  // Prohibido por término personalizado
    url: 'https://good-server.com/stream'
  },
  {
    name: 'Canal Regular',
    url: 'http://malicious-server.com/stream'  // Prohibido por URL
  },
  {
    name: 'Canal HD',
    url: 'https://spam-iptv.net/playlist'  // Prohibido por dominio
  },
  {
    name: 'Canal de Prueba',  // Prohibido por patrón regex
    url: 'https://valid-domain.com/stream'
  },
  {
    name: 'Canal Válido',
    url: 'http://203.0.113.1:8080/stream'  // Prohibido por IP
  },
  {
    name: 'ESPN HD',
    url: 'https://cdn.espn.com/stream'
  }
];

console.log('Canales originales:', testChannels.length);
const filteredChannels = filterBannedChannels(testChannels);
console.log('Canales después del filtrado:', filteredChannels.length);

console.log('\nCanales que pasaron el filtro:');
filteredChannels.forEach((channel, index) => {
  console.log(`  ${index + 1}. "${channel.name}" - ${channel.url}`);
});

console.log('\nCanales filtrados (prohibidos):');
const bannedChannels = testChannels.filter(channel => isChannelBannedByAnyReason(channel));
bannedChannels.forEach((channel, index) => {
  console.log(`  ${index + 1}. "${channel.name}" - ${channel.url}`);
  
  // Mostrar razón específica del baneo
  const reasons = [];
  if (channel.name && isChannelNameContainingCustomTerms(channel.name)) {
    reasons.push('término personalizado');
  }
  if (channel.name && isChannelNameMatchingPatterns(channel.name)) {
    reasons.push('patrón regex');
  }
  if (channel.url && isURLBanned(channel.url)) {
    reasons.push('URL prohibida');
  }
  if (channel.url && isChannelURLBanned(channel.url)) {
    reasons.push('IP prohibida');
  }
  if (channel.url) {
    const domain = channel.url.match(/https?:\/\/([^\/]+)/)?.[1];
    if (domain && isDomainBanned(domain)) {
      reasons.push('dominio prohibido');
    }
  }
  
  console.log(`     Razón: ${reasons.join(', ')}`);
});

// 8. Demostrar gestión dinámica
console.log('\n8. Demostrando gestión dinámica:');

// Agregar nueva URL prohibida
const newURL = 'https://new-malicious-site.com';
const urlAdded = addBannedURL(newURL);
console.log(`Agregando URL "${newURL}": ${urlAdded ? 'Exitoso' : 'Error'}`);

// Agregar nuevo dominio prohibido
const newDomain = 'bad-domain.org';
const domainAdded = addBannedDomain(newDomain);
console.log(`Agregando dominio "${newDomain}": ${domainAdded ? 'Exitoso' : 'Error'}`);

// Agregar nuevo término personalizado
const newTerm = 'blocked';
const termAdded = addCustomBannedTerm(newTerm);
console.log(`Agregando término "${newTerm}": ${termAdded ? 'Exitoso' : 'Error'}`);

// Agregar nuevo patrón regex
const newPattern = '.*forbidden.*';
const patternAdded = addBannedPattern(newPattern);
console.log(`Agregando patrón "${newPattern}": ${patternAdded ? 'Exitoso' : 'Error'}`);

// Verificar que los nuevos elementos funcionan
console.log('\n9. Verificando nuevos elementos agregados dinámicamente:');
const dynamicTestChannel = {
  name: 'Forbidden Channel',
  url: 'https://new-malicious-site.com/stream'
};

const isDynamicBanned = isChannelBannedByAnyReason(dynamicTestChannel);
console.log(`Canal "${dynamicTestChannel.name}" con URL "${dynamicTestChannel.url}":`);
console.log(`  Prohibido: ${isDynamicBanned ? 'SÍ' : 'NO'}`);

console.log('\n10. Estado final de la configuración:');
console.log('URLs prohibidas:', getBannedURLs());
console.log('Dominios prohibidos:', getBannedDomains());
console.log('Términos personalizados:', getCustomBannedTerms());
console.log('Patrones regex:', getBannedPatterns());

console.log('\n=== Prueba completada ===');
console.log('\n💡 Para usar en producción:');
console.log('1. Configura las variables en tu archivo .env');
console.log('2. Reinicia la aplicación para cargar la nueva configuración');
console.log('3. Usa las funciones de gestión dinámica para cambios en tiempo real');