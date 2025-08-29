/**
 * Script de prueba completo para el sistema de filtrado configurable desde .env
 * 
 * Este script demuestra cómo el sistema carga automáticamente la configuración
 * desde las variables de entorno definidas en .env
 */

// Cargar variables de entorno desde .env
import { config } from 'dotenv';
config();

import {
  // Constantes configurables
  BANNED_IPS,
  BANNED_IP_RANGES,
  BANNED_URLS,
  BANNED_DOMAINS,
  CUSTOM_BANNED_TERMS,
  BANNED_PATTERNS,
  
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
  filterBannedChannels
} from './src/config/banned-channels.js';

console.log('=== Sistema de Filtrado Configurable desde .env ===\n');

// 1. Mostrar configuración cargada automáticamente desde .env
console.log('1. Configuración cargada desde .env:');
console.log('Variables de entorno:');
console.log('  BANNED_IPS:', process.env.BANNED_IPS || '(no configurada)');
console.log('  BANNED_IP_RANGES:', process.env.BANNED_IP_RANGES || '(no configurada)');
console.log('  BANNED_URLS:', process.env.BANNED_URLS || '(no configurada)');
console.log('  BANNED_DOMAINS:', process.env.BANNED_DOMAINS || '(no configurada)');
console.log('  CUSTOM_BANNED_TERMS:', process.env.CUSTOM_BANNED_TERMS || '(no configurada)');
console.log('  BANNED_PATTERNS:', process.env.BANNED_PATTERNS || '(no configurada)');

console.log('\nArrays parseados:');
console.log('  IPs prohibidas:', BANNED_IPS);
console.log('  Rangos CIDR prohibidos:', BANNED_IP_RANGES);
console.log('  URLs prohibidas:', BANNED_URLS);
console.log('  Dominios prohibidos:', BANNED_DOMAINS);
console.log('  Términos personalizados:', CUSTOM_BANNED_TERMS);
console.log('  Patrones regex:', BANNED_PATTERNS.map(p => p.source));

// 2. Probar filtrado por IPs configuradas en .env
console.log('\n2. Probando filtrado por IPs configuradas en .env:');
const testIPs = ['203.0.113.1', '203.0.113.50', '198.51.100.25', '8.8.8.8', '1.1.1.1'];
testIPs.forEach(ip => {
  const banned = isIPBanned(ip);
  console.log(`  ${ip}: ${banned ? '🚫 PROHIBIDA' : '✅ Permitida'}`);
});

// 3. Probar filtrado por URLs configuradas en .env
console.log('\n3. Probando filtrado por URLs configuradas en .env:');
const testURLs = [
  'http://malicious-server.com/stream',
  'https://spam-iptv.net/playlist.m3u',
  'https://legitimate-server.com/stream',
  'http://203.0.113.1:8080/stream',
  'https://good-domain.com/channel'
];
testURLs.forEach(url => {
  const bannedByURL = isURLBanned(url);
  const bannedByIP = isChannelURLBanned(url);
  const anyBanned = bannedByURL || bannedByIP;
  console.log(`  ${url}`);
  console.log(`    ${anyBanned ? '🚫' : '✅'} Estado: ${anyBanned ? 'PROHIBIDA' : 'Permitida'}`);
  if (bannedByURL) console.log(`      - Prohibida por URL`);
  if (bannedByIP) console.log(`      - Prohibida por IP`);
});

// 4. Probar filtrado por dominios configurados en .env
console.log('\n4. Probando filtrado por dominios configurados en .env:');
const testDomains = [
  'malicious-domain.com',
  'sub.malicious-domain.com',
  'spam-iptv.net',
  'legitimate-domain.com',
  'cdn.example.com'
];
testDomains.forEach(domain => {
  const banned = isDomainBanned(domain);
  console.log(`  ${domain}: ${banned ? '🚫 PROHIBIDO' : '✅ Permitido'}`);
});

// 5. Probar filtrado por términos personalizados configurados en .env
console.log('\n5. Probando filtrado por términos personalizados configurados en .env:');
const testChannelNames = [
  'Canal Test HD',
  'Demo Channel',
  'Sample Stream',
  'Canal Normal',
  'ESPN HD',
  'Discovery Channel'
];
testChannelNames.forEach(name => {
  const banned = isChannelNameContainingCustomTerms(name);
  console.log(`  "${name}": ${banned ? '🚫 PROHIBIDO' : '✅ Permitido'}`);
});

// 6. Probar filtrado por patrones regex configurados en .env
console.log('\n6. Probando filtrado por patrones regex configurados en .env:');
const testPatternNames = [
  'Canal de Prueba',
  'Testing Channel',
  'Canal Normal',
  'Stream de Testing',
  'HBO Max'
];
testPatternNames.forEach(name => {
  const banned = isChannelNameMatchingPatterns(name);
  console.log(`  "${name}": ${banned ? '🚫 PROHIBIDO' : '✅ Permitido'}`);
});

// 7. Probar filtrado completo de canales con configuración desde .env
console.log('\n7. Probando filtrado completo de canales:');
const testChannels = [
  {
    name: 'Canal Normal',
    url: 'https://legitimate-server.com/stream1'
  },
  {
    name: 'Canal Test',  // Prohibido por término personalizado (configurado en .env)
    url: 'https://good-server.com/stream'
  },
  {
    name: 'Canal Regular',
    url: 'http://malicious-server.com/stream'  // Prohibido por URL (configurado en .env)
  },
  {
    name: 'Canal HD',
    url: 'https://spam-iptv.net/playlist'  // Prohibido por dominio (configurado en .env)
  },
  {
    name: 'Canal de Prueba',  // Prohibido por patrón regex (configurado en .env)
    url: 'https://valid-domain.com/stream'
  },
  {
    name: 'Canal Válido',
    url: 'http://203.0.113.1:8080/stream'  // Prohibido por IP (configurado en .env)
  },
  {
    name: 'ESPN HD',
    url: 'https://cdn.espn.com/stream'
  },
  {
    name: 'Discovery Channel',
    url: 'https://discovery.com/live'
  }
];

console.log(`\nCanales originales: ${testChannels.length}`);
const filteredChannels = filterBannedChannels(testChannels);
console.log(`Canales después del filtrado: ${filteredChannels.length}`);

console.log('\n✅ Canales que pasaron el filtro:');
filteredChannels.forEach((channel, index) => {
  console.log(`  ${index + 1}. "${channel.name}" - ${channel.url}`);
});

console.log('\n🚫 Canales filtrados (prohibidos):');
const bannedChannels = testChannels.filter(channel => isChannelBannedByAnyReason(channel));
if (bannedChannels.length === 0) {
  console.log('  (Ningún canal fue prohibido con la configuración actual)');
} else {
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
    
    console.log(`     📋 Razón: ${reasons.join(', ')}`);
  });
}

// 8. Mostrar resumen de configuración
console.log('\n8. Resumen de configuración activa:');
console.log(`  📍 IPs prohibidas: ${getBannedIPs().length} configuradas`);
console.log(`  🌐 Rangos CIDR prohibidos: ${getBannedIPRanges().length} configurados`);
console.log(`  🔗 URLs prohibidas: ${getBannedURLs().length} configuradas`);
console.log(`  🏠 Dominios prohibidos: ${getBannedDomains().length} configurados`);
console.log(`  📝 Términos personalizados: ${getCustomBannedTerms().length} configurados`);
console.log(`  🔍 Patrones regex: ${getBannedPatterns().length} configurados`);

console.log('\n=== Prueba completada exitosamente ===');
console.log('\n💡 Instrucciones para uso en producción:');
console.log('1. 📝 Edita tu archivo .env con las configuraciones deseadas');
console.log('2. 🔄 Reinicia la aplicación para cargar la nueva configuración');
console.log('3. ⚡ Usa las funciones de gestión dinámica para cambios en tiempo real');
console.log('4. 🧪 Ejecuta este script para verificar tu configuración');

console.log('\n📋 Variables de entorno disponibles:');
console.log('  - BANNED_IPS: Lista de IPs específicas separadas por comas');
console.log('  - BANNED_IP_RANGES: Lista de rangos CIDR separados por comas');
console.log('  - BANNED_URLS: Lista de URLs específicas separadas por comas');
console.log('  - BANNED_DOMAINS: Lista de dominios separados por comas');
console.log('  - CUSTOM_BANNED_TERMS: Lista de términos personalizados separados por comas');
console.log('  - BANNED_PATTERNS: Lista de patrones regex separados por comas');