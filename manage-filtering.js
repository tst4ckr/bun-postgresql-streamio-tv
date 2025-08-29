#!/usr/bin/env bun
/**
 * Script de gestión de filtrado de canales
 * 
 * Este script permite a los administradores gestionar las reglas de filtrado
 * desde la línea de comandos sin necesidad de editar código.
 * 
 * Uso:
 *   bun run manage-filtering.js <comando> [argumentos]
 * 
 * Comandos disponibles:
 *   status                    - Mostrar estado actual del filtrado
 *   add-ip <ip>              - Agregar IP a la lista de prohibidas
 *   remove-ip <ip>           - Remover IP de la lista de prohibidas
 *   add-domain <domain>      - Agregar dominio a la lista de prohibidos
 *   remove-domain <domain>   - Remover dominio de la lista de prohibidos
 *   add-url <url>            - Agregar URL a la lista de prohibidas
 *   remove-url <url>         - Remover URL de la lista de prohibidas
 *   add-term <term>          - Agregar término a la lista de prohibidos
 *   remove-term <term>       - Remover término de la lista de prohibidos
 *   add-pattern <pattern>    - Agregar patrón regex a la lista de prohibidos
 *   remove-pattern <pattern> - Remover patrón regex de la lista de prohibidos
 *   test-channel <name> <url> - Probar si un canal sería filtrado
 *   test-url <url>           - Probar si una URL sería filtrada
 *   test-ip <ip>             - Probar si una IP sería filtrada
 *   clear-all                - Limpiar todas las listas dinámicas
 */

// Cargar variables de entorno
import { config } from 'dotenv';
config();

import {
  // Funciones de obtención
  getBannedIPs,
  getBannedIPRanges,
  getBannedURLs,
  getBannedDomains,
  getCustomBannedTerms,
  getBannedPatterns,
  
  // Funciones de gestión
  addBannedIP,
  removeBannedIP,
  addBannedURL,
  removeBannedURL,
  addBannedDomain,
  removeBannedDomain,
  addCustomBannedTerm,
  removeCustomBannedTerm,
  addBannedPattern,
  removeBannedPattern,
  
  // Funciones de validación
  isIPBanned,
  isURLBanned,
  isDomainBanned,
  isChannelBannedByAnyReason,
  isChannelURLBanned,
  isChannelNameContainingCustomTerms,
  isChannelNameMatchingPatterns
} from './src/config/banned-channels.js';

// Obtener argumentos de línea de comandos
const args = process.argv.slice(2);
const command = args[0];
const argument = args[1];
const argument2 = args[2];

// Función para mostrar ayuda
function showHelp() {
  console.log('🛠️  Gestor de Filtrado de Canales');
  console.log('\n📋 Comandos disponibles:');
  console.log('\n📊 Consulta:');
  console.log('  status                     - Mostrar estado actual del filtrado');
  console.log('\n🚫 Gestión de IPs:');
  console.log('  add-ip <ip>               - Agregar IP a la lista de prohibidas');
  console.log('  remove-ip <ip>            - Remover IP de la lista de prohibidas');
  console.log('\n🌐 Gestión de Dominios:');
  console.log('  add-domain <domain>       - Agregar dominio a la lista de prohibidos');
  console.log('  remove-domain <domain>    - Remover dominio de la lista de prohibidos');
  console.log('\n🔗 Gestión de URLs:');
  console.log('  add-url <url>             - Agregar URL a la lista de prohibidas');
  console.log('  remove-url <url>          - Remover URL de la lista de prohibidas');
  console.log('\n📝 Gestión de Términos:');
  console.log('  add-term <term>           - Agregar término a la lista de prohibidos');
  console.log('  remove-term <term>        - Remover término de la lista de prohibidos');
  console.log('\n🔍 Gestión de Patrones:');
  console.log('  add-pattern <pattern>     - Agregar patrón regex a la lista de prohibidos');
  console.log('  remove-pattern <pattern>  - Remover patrón regex de la lista de prohibidos');
  console.log('\n🧪 Pruebas:');
  console.log('  test-channel <name> <url> - Probar si un canal sería filtrado');
  console.log('  test-url <url>            - Probar si una URL sería filtrada');
  console.log('  test-ip <ip>              - Probar si una IP sería filtrada');
  console.log('\n🗑️  Limpieza:');
  console.log('  clear-all                 - Limpiar todas las listas dinámicas');
  console.log('\n💡 Ejemplos:');
  console.log('  bun run manage-filtering.js status');
  console.log('  bun run manage-filtering.js add-ip 192.168.1.100');
  console.log('  bun run manage-filtering.js add-domain spam-server.com');
  console.log('  bun run manage-filtering.js test-channel "Canal Test" "http://example.com/stream"');
}

// Función para mostrar estado
function showStatus() {
  console.log('📊 Estado Actual del Sistema de Filtrado\n');
  
  console.log('🔧 Configuración desde .env:');
  console.log(`  BANNED_IPS: ${process.env.BANNED_IPS || '(no configurada)'}`);
  console.log(`  BANNED_IP_RANGES: ${process.env.BANNED_IP_RANGES || '(no configurada)'}`);
  console.log(`  BANNED_URLS: ${process.env.BANNED_URLS || '(no configurada)'}`);
  console.log(`  BANNED_DOMAINS: ${process.env.BANNED_DOMAINS || '(no configurada)'}`);
  console.log(`  CUSTOM_BANNED_TERMS: ${process.env.CUSTOM_BANNED_TERMS || '(no configurada)'}`);
  console.log(`  BANNED_PATTERNS: ${process.env.BANNED_PATTERNS || '(no configurada)'}`);
  
  console.log('\n📋 Listas Activas:');
  console.log(`  📍 IPs prohibidas: ${getBannedIPs().length} elementos`);
  getBannedIPs().forEach((ip, index) => {
    console.log(`    ${index + 1}. ${ip}`);
  });
  
  console.log(`  🌐 Rangos CIDR prohibidos: ${getBannedIPRanges().length} elementos`);
  getBannedIPRanges().forEach((range, index) => {
    console.log(`    ${index + 1}. ${range}`);
  });
  
  console.log(`  🔗 URLs prohibidas: ${getBannedURLs().length} elementos`);
  getBannedURLs().forEach((url, index) => {
    console.log(`    ${index + 1}. ${url}`);
  });
  
  console.log(`  🏠 Dominios prohibidos: ${getBannedDomains().length} elementos`);
  getBannedDomains().forEach((domain, index) => {
    console.log(`    ${index + 1}. ${domain}`);
  });
  
  console.log(`  📝 Términos personalizados: ${getCustomBannedTerms().length} elementos`);
  getCustomBannedTerms().forEach((term, index) => {
    console.log(`    ${index + 1}. ${term}`);
  });
  
  console.log(`  🔍 Patrones regex: ${getBannedPatterns().length} elementos`);
  getBannedPatterns().forEach((pattern, index) => {
    console.log(`    ${index + 1}. ${pattern.source}`);
  });
}

// Función para limpiar todas las listas
function clearAll() {
  console.log('🗑️  Limpiando todas las listas dinámicas...');
  
  // Obtener listas actuales
  const ips = [...getBannedIPs()];
  const urls = [...getBannedURLs()];
  const domains = [...getBannedDomains()];
  const terms = [...getCustomBannedTerms()];
  const patterns = [...getBannedPatterns()];
  
  // Remover todos los elementos
  ips.forEach(ip => removeBannedIP(ip));
  urls.forEach(url => removeBannedURL(url));
  domains.forEach(domain => removeBannedDomain(domain));
  terms.forEach(term => removeCustomBannedTerm(term));
  patterns.forEach(pattern => removeBannedPattern(pattern.source));
  
  console.log(`✅ Limpieza completada:`);
  console.log(`  - ${ips.length} IPs removidas`);
  console.log(`  - ${urls.length} URLs removidas`);
  console.log(`  - ${domains.length} dominios removidos`);
  console.log(`  - ${terms.length} términos removidos`);
  console.log(`  - ${patterns.length} patrones removidos`);
  console.log('\n⚠️  Nota: Solo se limpiaron las listas dinámicas. La configuración desde .env permanece activa.');
}

// Función para probar un canal
function testChannel(name, url) {
  console.log(`🧪 Probando canal: "${name}" - ${url}\n`);
  
  const channel = { name, url };
  const isBanned = isChannelBannedByAnyReason(channel);
  
  console.log(`Resultado: ${isBanned ? '🚫 PROHIBIDO' : '✅ PERMITIDO'}`);
  
  if (isBanned) {
    console.log('\n📋 Razones del filtrado:');
    
    if (isChannelNameContainingCustomTerms(name)) {
      console.log('  - Contiene términos personalizados prohibidos');
    }
    
    if (isChannelNameMatchingPatterns(name)) {
      console.log('  - Coincide con patrones regex prohibidos');
    }
    
    if (isURLBanned(url)) {
      console.log('  - URL está en la lista de prohibidas');
    }
    
    if (isChannelURLBanned(url)) {
      console.log('  - IP de la URL está prohibida');
    }
    
    const domain = url.match(/https?:\/\/([^\/]+)/)?.[1];
    if (domain && isDomainBanned(domain)) {
      console.log('  - Dominio está en la lista de prohibidos');
    }
  }
}

// Función para probar una URL
function testURL(url) {
  console.log(`🧪 Probando URL: ${url}\n`);
  
  const bannedByURL = isURLBanned(url);
  const bannedByIP = isChannelURLBanned(url);
  const domain = url.match(/https?:\/\/([^\/]+)/)?.[1];
  const bannedByDomain = domain ? isDomainBanned(domain) : false;
  
  const anyBanned = bannedByURL || bannedByIP || bannedByDomain;
  
  console.log(`Resultado: ${anyBanned ? '🚫 PROHIBIDA' : '✅ PERMITIDA'}`);
  
  if (anyBanned) {
    console.log('\n📋 Razones del filtrado:');
    if (bannedByURL) console.log('  - URL está en la lista de prohibidas');
    if (bannedByIP) console.log('  - IP está prohibida');
    if (bannedByDomain) console.log('  - Dominio está prohibido');
  }
}

// Función para probar una IP
function testIP(ip) {
  console.log(`🧪 Probando IP: ${ip}\n`);
  
  const banned = isIPBanned(ip);
  console.log(`Resultado: ${banned ? '🚫 PROHIBIDA' : '✅ PERMITIDA'}`);
}

// Procesar comandos
switch (command) {
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    showHelp();
    break;
    
  case 'status':
    showStatus();
    break;
    
  case 'add-ip':
    if (!argument) {
      console.log('❌ Error: Debes especificar una IP');
      console.log('Uso: bun run manage-filtering.js add-ip <ip>');
      process.exit(1);
    }
    if (addBannedIP(argument)) {
      console.log(`✅ IP ${argument} agregada exitosamente`);
    } else {
      console.log(`❌ Error: No se pudo agregar la IP ${argument}`);
    }
    break;
    
  case 'remove-ip':
    if (!argument) {
      console.log('❌ Error: Debes especificar una IP');
      console.log('Uso: bun run manage-filtering.js remove-ip <ip>');
      process.exit(1);
    }
    if (removeBannedIP(argument)) {
      console.log(`✅ IP ${argument} removida exitosamente`);
    } else {
      console.log(`❌ Error: No se pudo remover la IP ${argument}`);
    }
    break;
    
  case 'add-domain':
    if (!argument) {
      console.log('❌ Error: Debes especificar un dominio');
      console.log('Uso: bun run manage-filtering.js add-domain <domain>');
      process.exit(1);
    }
    if (addBannedDomain(argument)) {
      console.log(`✅ Dominio ${argument} agregado exitosamente`);
    } else {
      console.log(`❌ Error: No se pudo agregar el dominio ${argument}`);
    }
    break;
    
  case 'remove-domain':
    if (!argument) {
      console.log('❌ Error: Debes especificar un dominio');
      console.log('Uso: bun run manage-filtering.js remove-domain <domain>');
      process.exit(1);
    }
    if (removeBannedDomain(argument)) {
      console.log(`✅ Dominio ${argument} removido exitosamente`);
    } else {
      console.log(`❌ Error: No se pudo remover el dominio ${argument}`);
    }
    break;
    
  case 'add-url':
    if (!argument) {
      console.log('❌ Error: Debes especificar una URL');
      console.log('Uso: bun run manage-filtering.js add-url <url>');
      process.exit(1);
    }
    if (addBannedURL(argument)) {
      console.log(`✅ URL ${argument} agregada exitosamente`);
    } else {
      console.log(`❌ Error: No se pudo agregar la URL ${argument}`);
    }
    break;
    
  case 'remove-url':
    if (!argument) {
      console.log('❌ Error: Debes especificar una URL');
      console.log('Uso: bun run manage-filtering.js remove-url <url>');
      process.exit(1);
    }
    if (removeBannedURL(argument)) {
      console.log(`✅ URL ${argument} removida exitosamente`);
    } else {
      console.log(`❌ Error: No se pudo remover la URL ${argument}`);
    }
    break;
    
  case 'add-term':
    if (!argument) {
      console.log('❌ Error: Debes especificar un término');
      console.log('Uso: bun run manage-filtering.js add-term <term>');
      process.exit(1);
    }
    if (addCustomBannedTerm(argument)) {
      console.log(`✅ Término "${argument}" agregado exitosamente`);
    } else {
      console.log(`❌ Error: No se pudo agregar el término "${argument}"`);
    }
    break;
    
  case 'remove-term':
    if (!argument) {
      console.log('❌ Error: Debes especificar un término');
      console.log('Uso: bun run manage-filtering.js remove-term <term>');
      process.exit(1);
    }
    if (removeCustomBannedTerm(argument)) {
      console.log(`✅ Término "${argument}" removido exitosamente`);
    } else {
      console.log(`❌ Error: No se pudo remover el término "${argument}"`);
    }
    break;
    
  case 'add-pattern':
    if (!argument) {
      console.log('❌ Error: Debes especificar un patrón');
      console.log('Uso: bun run manage-filtering.js add-pattern <pattern>');
      process.exit(1);
    }
    if (addBannedPattern(argument)) {
      console.log(`✅ Patrón "${argument}" agregado exitosamente`);
    } else {
      console.log(`❌ Error: No se pudo agregar el patrón "${argument}"`);
    }
    break;
    
  case 'remove-pattern':
    if (!argument) {
      console.log('❌ Error: Debes especificar un patrón');
      console.log('Uso: bun run manage-filtering.js remove-pattern <pattern>');
      process.exit(1);
    }
    if (removeBannedPattern(argument)) {
      console.log(`✅ Patrón "${argument}" removido exitosamente`);
    } else {
      console.log(`❌ Error: No se pudo remover el patrón "${argument}"`);
    }
    break;
    
  case 'test-channel':
    if (!argument || !argument2) {
      console.log('❌ Error: Debes especificar nombre y URL del canal');
      console.log('Uso: bun run manage-filtering.js test-channel <name> <url>');
      process.exit(1);
    }
    testChannel(argument, argument2);
    break;
    
  case 'test-url':
    if (!argument) {
      console.log('❌ Error: Debes especificar una URL');
      console.log('Uso: bun run manage-filtering.js test-url <url>');
      process.exit(1);
    }
    testURL(argument);
    break;
    
  case 'test-ip':
    if (!argument) {
      console.log('❌ Error: Debes especificar una IP');
      console.log('Uso: bun run manage-filtering.js test-ip <ip>');
      process.exit(1);
    }
    testIP(argument);
    break;
    
  case 'clear-all':
    clearAll();
    break;
    
  default:
    console.log(`❌ Comando desconocido: ${command}`);
    console.log('\nUsa "bun run manage-filtering.js help" para ver los comandos disponibles.');
    process.exit(1);
}