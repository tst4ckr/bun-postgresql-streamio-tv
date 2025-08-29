/**
 * @fileoverview Debug del filtrado automático de canales
 * Analiza por qué el modo automático no encuentra URLs con '/play/' e IPs públicas
 */

import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';
import { M3UParserService } from './src/infrastructure/parsers/M3UParserService.js';
import fetch from 'node-fetch';
import { URL } from 'url';

// Logger simple
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
};

/**
 * Verifica si una dirección IP es pública
 * @param {string} hostname
 * @returns {boolean}
 */
function isPublicIP(hostname) {
  // Verificar que sea una IP válida
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (!ipRegex.test(hostname)) {
    return false;
  }

  const parts = hostname.split('.').map(Number);
  const [a, b, c, d] = parts;

  // Verificar que NO sea IP privada
  // 10.0.0.0/8
  if (a === 10) return false;
  
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return false;
  
  // 192.168.0.0/16
  if (a === 192 && b === 168) return false;
  
  // 127.0.0.0/8 (localhost)
  if (a === 127) return false;
  
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return false;
  
  // 224.0.0.0/4 (multicast)
  if (a >= 224 && a <= 239) return false;
  
  // 240.0.0.0/4 (reserved)
  if (a >= 240) return false;

  return true;
}

/**
 * Descarga contenido M3U desde URL
 * @param {string} url
 * @returns {Promise<string>}
 */
async function downloadM3U(url) {
  try {
    logger.info(`Descargando M3U desde: \`${url}\``);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const content = await response.text();
    
    if (!content || content.trim().length === 0) {
      throw new Error('Contenido M3U vacío');
    }
    
    logger.info(`M3U descargado: ${content.length} caracteres`);
    return content;
    
  } catch (error) {
    logger.error(`Error descargando M3U desde ${url}:`, error);
    throw new Error(`Error descargando M3U: ${error.message}`);
  }
}

/**
 * Función principal de debug
 */
async function debugAutomaticFiltering() {
  try {
    console.log('🔍 === DEBUG: Filtrado Automático de Canales ===\n');
    
    // Cargar configuración
    const config = new TVAddonConfig();
    const autoM3uUrl = config.dataSources.autoM3uUrl;
    
    console.log(`📥 URL M3U automática: ${autoM3uUrl}`);
    console.log('=' .repeat(80));
    
    // 1. Descargar M3U
    const m3uContent = await downloadM3U(autoM3uUrl);
    
    // 2. Parsear M3U
    const parser = new M3UParserService(config.filters);
    const parsedChannels = await parser.parseM3U(m3uContent);
    
    console.log(`\n📊 Estadísticas iniciales:`);
    console.log(`   Total de canales parseados: ${parsedChannels.length}`);
    
    // 3. Analizar URLs con '/play/'
    const playUrls = [];
    const playUrlsDetails = [];
    
    for (const channel of parsedChannels) {
      if (channel.url && channel.url.includes('/play/')) {
        playUrls.push(channel.url);
        playUrlsDetails.push({
          name: channel.name,
          url: channel.url,
          country: channel.country || 'Unknown'
        });
      }
    }
    
    console.log(`\n🔍 URLs con '/play/' encontradas: ${playUrls.length}`);
    
    if (playUrls.length > 0) {
      console.log(`\n📋 Primeras 10 URLs con '/play/':`);
      playUrlsDetails.slice(0, 10).forEach((detail, index) => {
        console.log(`   ${index + 1}. ${detail.name}`);
        console.log(`      URL: ${detail.url}`);
        console.log(`      País: ${detail.country}`);
        console.log('');
      });
    } else {
      console.log(`\n⚠️  No se encontraron URLs con '/play/' en el M3U`);
    }
    
    // Analizar patrones de URLs para entender qué tipo de URLs hay
    console.log(`\n🔍 Analizando patrones de URLs (primeras 20):`);
    const urlPatterns = new Map();
    const domainTypes = new Map();
    
    parsedChannels.slice(0, 20).forEach((channel, index) => {
      if (channel.url) {
        try {
          const url = new URL(channel.url);
          const pattern = `${url.protocol}//${url.hostname}`;
          urlPatterns.set(pattern, (urlPatterns.get(pattern) || 0) + 1);
          
          // Analizar tipos de dominio
          const hostname = url.hostname;
          if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
            domainTypes.set('IP', (domainTypes.get('IP') || 0) + 1);
          } else if (hostname.includes('.m3u')) {
            domainTypes.set('M3U_DOMAIN', (domainTypes.get('M3U_DOMAIN') || 0) + 1);
          } else {
            domainTypes.set('DOMAIN', (domainTypes.get('DOMAIN') || 0) + 1);
          }
          
          console.log(`   ${index + 1}. ${channel.name}`);
          console.log(`      URL: ${channel.url}`);
          console.log(`      Hostname: ${url.hostname}`);
          console.log(`      Pathname: ${url.pathname}`);
          console.log(`      Contiene '/play/': ${url.pathname.includes('/play/')}`);
          console.log(`      Es IP: ${/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)}`);
          console.log('');
        } catch (error) {
          console.log(`   ${index + 1}. ${channel.name} - URL inválida: ${channel.url}`);
        }
      } else {
        console.log(`   ${index + 1}. ${channel.name} - Sin URL`);
      }
    });
    
    console.log(`\n📊 Patrones de URL más comunes:`);
    Array.from(urlPatterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([pattern, count]) => {
        console.log(`   ${count}x: ${pattern}`);
      });
    
    console.log(`\n🏷️ Tipos de dominio encontrados:`);
    domainTypes.forEach((count, type) => {
      console.log(`   ${type}: ${count} URLs`);
    });
    
    // 4. Filtrar por IPs públicas
    const publicIpUrls = [];
    const publicIpDetails = [];
    
    for (const url of playUrls) {
      try {
        const urlObj = new URL(url);
        if (isPublicIP(urlObj.hostname)) {
          publicIpUrls.push(url);
          publicIpDetails.push({
            url: url,
            hostname: urlObj.hostname,
            port: urlObj.port || '80'
          });
        }
      } catch (error) {
        console.log(`   URL inválida ignorada: ${url}`);
      }
    }
    
    console.log(`\n🌐 URLs con IPs públicas: ${publicIpUrls.length}`);
    
    if (publicIpUrls.length > 0) {
      console.log(`\n📋 URLs con IPs públicas encontradas:`);
      publicIpDetails.forEach((detail, index) => {
        console.log(`   ${index + 1}. ${detail.hostname}:${detail.port}`);
        console.log(`      URL completa: ${detail.url}`);
        console.log('');
      });
    } else {
      console.log(`\n⚠️  No se encontraron URLs con IPs públicas`);
      
      if (playUrls.length > 0) {
        console.log(`\n🔍 Analizando hostnames de URLs con '/play/':`);
        playUrls.slice(0, 10).forEach((url, index) => {
          try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
            const isPublic = isIP ? isPublicIP(hostname) : false;
            
            console.log(`   ${index + 1}. ${hostname}`);
            console.log(`      Es IP: ${isIP}`);
            console.log(`      Es IP pública: ${isPublic}`);
            console.log(`      URL: ${url}`);
            console.log('');
          } catch (error) {
            console.log(`   ${index + 1}. URL inválida: ${url}`);
          }
        });
      }
    }
    
    // 5. Generar URLs de playlist
    const playlistUrls = [];
    const processedBaseUrls = new Set();
    
    for (const url of publicIpUrls) {
      try {
        const urlObj = new URL(url);
        const baseUrl = `http://${urlObj.hostname}:${urlObj.port || '80'}/playlist.m3u`;
        
        if (!processedBaseUrls.has(baseUrl)) {
          processedBaseUrls.add(baseUrl);
          playlistUrls.push(baseUrl);
        }
      } catch (error) {
        console.log(`   Error procesando URL: ${url}`);
      }
    }
    
    console.log(`\n📋 URLs de playlist generadas: ${playlistUrls.length}`);
    
    if (playlistUrls.length > 0) {
      console.log(`\n📋 URLs de playlist:`);
      playlistUrls.forEach((url, index) => {
        console.log(`   ${index + 1}. ${url}`);
      });
    }
    
    // Resumen final
    console.log(`\n✅ Resumen del análisis:`);
    console.log('=' .repeat(50));
    console.log(`📥 Canales descargados: ${parsedChannels.length}`);
    console.log(`🔍 URLs con '/play/': ${playUrls.length}`);
    console.log(`🌐 URLs con IPs públicas: ${publicIpUrls.length}`);
    console.log(`📋 URLs de playlist generadas: ${playlistUrls.length}`);
    
    if (playlistUrls.length === 0) {
      console.log(`\n❌ PROBLEMA IDENTIFICADO:`);
      if (playUrls.length === 0) {
        console.log(`   • No se encontraron URLs con '/play/' en el M3U`);
        console.log(`   • La fuente M3U no contiene el tipo de URLs esperadas`);
        console.log(`   • Considerar usar una fuente M3U diferente`);
      } else {
        console.log(`   • Se encontraron URLs con '/play/' pero ninguna tiene IP pública`);
        console.log(`   • Las URLs usan dominios en lugar de IPs`);
        console.log(`   • Considerar modificar el filtro para aceptar dominios`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error durante el debug:');
    console.error('=' .repeat(50));
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(`Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Ejecutar debug
debugAutomaticFiltering();