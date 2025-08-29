/**
 * @fileoverview Debug simple del parser M3U
 * Analiza qué datos está devolviendo realmente el parser
 */

import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';
import { M3UParserService } from './src/infrastructure/parsers/M3UParserService.js';
import fetch from 'node-fetch';

// Logger simple
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
};

/**
 * Descarga contenido M3U
 */
async function downloadM3U(url) {
  logger.info(`Descargando M3U desde: \`${url}\``);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
  });
  
  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
  }
  
  const content = await response.text();
  logger.info(`M3U descargado: ${content.length} caracteres`);
  
  return content;
}

/**
 * Debug principal
 */
async function debugM3UParser() {
  try {
    console.log('🔍 === DEBUG: Parser M3U ===\n');
    
    // Obtener configuración
    const config = TVAddonConfig.getInstance();
    const autoM3uUrl = config.dataSources.autoM3uUrl;
    
    console.log(`📥 URL M3U automática: ${autoM3uUrl}`);
    console.log('=' .repeat(80));
    
    // 1. Descargar M3U
    const m3uContent = await downloadM3U(autoM3uUrl);
    
    // 2. Mostrar primeras líneas del M3U
    console.log('\n📄 Primeras 20 líneas del M3U:');
    const lines = m3uContent.split('\n').slice(0, 20);
    lines.forEach((line, index) => {
      console.log(`${(index + 1).toString().padStart(2, ' ')}: ${line}`);
    });
    
    // 3. Parsear M3U
    console.log('\n🔧 Parseando M3U...');
    const parser = new M3UParserService(config.filters);
    const channels = await parser.parseM3U(m3uContent);
    
    console.log(`\n📊 Estadísticas del parser:`);
    console.log(`   Total de canales parseados: ${channels.length}`);
    
    // 4. Analizar primeros canales
    console.log('\n🔍 Primeros 10 canales parseados:');
    channels.slice(0, 10).forEach((channel, index) => {
      console.log(`\n   ${index + 1}. Canal:`);
      console.log(`      ID: ${channel.id}`);
      console.log(`      Nombre: ${channel.name}`);
      console.log(`      URL: ${channel.streamUrl || 'SIN URL'}`);
      console.log(`      Logo: ${channel.logo || 'Sin logo'}`);
      console.log(`      Género: ${channel.genre}`);
      console.log(`      País: ${channel.country}`);
    });
    
    // 5. Contar canales con y sin URL
    const channelsWithUrl = channels.filter(ch => ch.streamUrl && ch.streamUrl.trim().length > 0);
    const channelsWithoutUrl = channels.filter(ch => !ch.streamUrl || ch.streamUrl.trim().length === 0);
    
    console.log('\n📈 Estadísticas de URLs:');
    console.log(`   Canales con URL: ${channelsWithUrl.length}`);
    console.log(`   Canales sin URL: ${channelsWithoutUrl.length}`);
    
    if (channelsWithUrl.length > 0) {
      console.log('\n✅ Ejemplos de canales CON URL:');
      channelsWithUrl.slice(0, 5).forEach((channel, index) => {
        console.log(`   ${index + 1}. ${channel.name}: ${channel.streamUrl}`);
      });
    }
    
    if (channelsWithoutUrl.length > 0) {
      console.log('\n❌ Ejemplos de canales SIN URL:');
      channelsWithoutUrl.slice(0, 5).forEach((channel, index) => {
        console.log(`   ${index + 1}. ${channel.name}`);
      });
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
debugM3UParser();