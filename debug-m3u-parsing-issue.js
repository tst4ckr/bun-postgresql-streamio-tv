/**
 * Script para debuggear el problema de parsing M3U
 * Descarga el M3U y analiza paso a paso el proceso de parsing
 */

import { M3UParserService } from './src/infrastructure/parsers/M3UParserService.js';
import { ContentPreprocessor, EntryProcessor } from './src/infrastructure/parsers/M3UParserService_tools.js';
import fetch from 'node-fetch';

async function debugM3UParsing() {
  const url = 'https://iptv-org.github.io/iptv/countries/pe.m3u';
  
  console.log('🔍 Debuggeando problema de parsing M3U');
  console.log('=' .repeat(60));
  console.log(`📥 Descargando desde: ${url}`);
  
  try {
    // 1. Descargar contenido
    const response = await fetch(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'TV-IPTV-Addon/1.0.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
    }
    
    const m3uContent = await response.text();
    console.log(`📄 Contenido descargado: ${m3uContent.length} caracteres`);
    
    // 2. Mostrar primeras líneas
    const firstLines = m3uContent.split('\n').slice(0, 10);
    console.log('\n📋 Primeras 10 líneas:');
    firstLines.forEach((line, index) => {
      console.log(`${index + 1}: ${line}`);
    });
    
    // 3. Preprocesar contenido
    console.log('\n🔄 Preprocesando contenido...');
    const lines = ContentPreprocessor.normalizeLines(m3uContent);
    console.log(`📊 Líneas después de normalización: ${lines.length}`);
    
    // 4. Validar formato M3U
    console.log('\n✅ Validando formato M3U...');
    try {
      const isValid = ContentPreprocessor.validateM3UFormat(m3uContent, false);
      console.log(`📋 Formato M3U válido: ${isValid}`);
    } catch (error) {
      console.log(`❌ Error de validación: ${error.message}`);
    }
    
    // 5. Extraer entradas crudas
    console.log('\n🔍 Extrayendo entradas crudas...');
    const rawEntries = EntryProcessor.extractRawEntries(lines, 20000);
    console.log(`📊 Entradas extraídas: ${rawEntries.length}`);
    
    // 6. Mostrar primeras entradas
    if (rawEntries.length > 0) {
      console.log('\n📋 Primeras 3 entradas extraídas:');
      rawEntries.slice(0, 3).forEach((entry, index) => {
        console.log(`\nEntrada ${index + 1}:`);
        console.log(`  EXTINF: ${entry.extinf}`);
        console.log(`  URL: ${entry.url}`);
        console.log(`  Línea: ${entry.lineNumber}`);
      });
    } else {
      console.log('❌ No se extrajeron entradas');
      
      // Debug adicional: buscar líneas EXTINF
      console.log('\n🔍 Buscando líneas EXTINF manualmente...');
      const extinfLines = lines.filter(line => line.startsWith('#EXTINF:'));
      console.log(`📊 Líneas EXTINF encontradas: ${extinfLines.length}`);
      
      if (extinfLines.length > 0) {
        console.log('\n📋 Primeras 3 líneas EXTINF:');
        extinfLines.slice(0, 3).forEach((line, index) => {
          console.log(`${index + 1}: ${line}`);
        });
      }
      
      // Buscar URLs
      console.log('\n🔍 Buscando URLs...');
      const urlLines = lines.filter(line => 
        line.startsWith('http://') || line.startsWith('https://')
      );
      console.log(`📊 URLs encontradas: ${urlLines.length}`);
      
      if (urlLines.length > 0) {
        console.log('\n📋 Primeras 3 URLs:');
        urlLines.slice(0, 3).forEach((url, index) => {
          console.log(`${index + 1}: ${url}`);
        });
      }
    }
    
    // 7. Usar el parser completo
    console.log('\n🔄 Usando M3UParserService completo...');
    const parser = new M3UParserService();
    const parsedChannels = await parser.parseM3U(m3uContent);
    console.log(`📺 Canales parseados por M3UParserService: ${parsedChannels.length}`);
    
    if (parsedChannels.length > 0) {
      console.log('\n📋 Primeros 3 canales parseados:');
      parsedChannels.slice(0, 3).forEach((channel, index) => {
        console.log(`\nCanal ${index + 1}:`);
        console.log(`  ID: ${channel.id}`);
        console.log(`  Nombre: ${channel.name}`);
        console.log(`  URL: ${channel.url}`);
        console.log(`  Grupo: ${channel.group}`);
        console.log(`  País: ${channel.country}`);
      });
    }
    
    // 8. Obtener estadísticas detalladas
    console.log('\n📊 Obteniendo estadísticas detalladas...');
    const stats = await parser.getParseStats(m3uContent);
    console.log('Estadísticas:', JSON.stringify(stats, null, 2));
    
  } catch (error) {
    console.error('\n❌ Error durante el debug:');
    console.error('=' .repeat(50));
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(`Stack: ${error.stack}`);
    }
  }
}

// Ejecutar debug
debugM3UParsing();