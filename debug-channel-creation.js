/**
 * Script para debuggear la creación de Channel desde M3U
 * Simula exactamente el proceso del M3UParserService
 */

import { Channel } from './src/domain/entities/Channel.js';
import { EntryProcessor, MetadataExtractor } from './src/infrastructure/parsers/M3UParserService_tools.js';
import fetch from 'node-fetch';

async function debugChannelCreation() {
  const m3uUrl = 'https://iptv-org.github.io/iptv/countries/pe.m3u';
  
  console.log('🔍 Debuggeando creación de Channel desde M3U');
  console.log('=' .repeat(60));
  
  try {
    // 1. Descargar M3U
    const response = await fetch(m3uUrl);
    const content = await response.text();
    
    // 2. Extraer líneas
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    
    // 3. Extraer entradas crudas
    const rawEntries = EntryProcessor.extractRawEntries(lines, 20000);
    console.log(`📊 Entradas extraídas: ${rawEntries.length}`);
    
    if (rawEntries.length === 0) {
      console.log('❌ No se extrajeron entradas');
      return;
    }
    
    // 4. Probar creación de canales con las primeras 5 entradas
    console.log('\n🔄 Probando creación de canales...');
    console.log('=' .repeat(50));
    
    const config = {
      strictMode: false,
      maxChannels: 20000,
      enableQualityDetection: true,
      enableLogoExtraction: true,
      defaultGenre: Channel.GENRES.GENERAL,
      defaultCountry: 'Internacional',
      defaultLanguage: 'es',
      defaultQuality: 'Auto'
    };
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (let i = 0; i < Math.min(5, rawEntries.length); i++) {
      const entry = rawEntries[i];
      
      console.log(`\n📋 Procesando entrada ${i + 1}:`);
      console.log(`   EXTINF: ${entry.extinf}`);
      console.log(`   URL: ${entry.url}`);
      
      try {
        // Paso 1: Extraer metadatos
        console.log('   🔍 Extrayendo metadatos...');
        const metadata = MetadataExtractor.extractFromExtinf(entry.extinf);
        console.log(`   📝 Nombre: ${metadata.name}`);
        console.log(`   🏷️ Grupo: ${metadata.group}`);
        console.log(`   🖼️ Logo: ${metadata.logo}`);
        
        // Paso 2: Crear datos del canal
        console.log('   🔄 Creando datos del canal...');
        const channelData = EntryProcessor.createChannelData(entry, config);
        
        if (!channelData) {
          console.log('   ❌ createChannelData retornó null');
          errorCount++;
          errors.push({
            entry: i + 1,
            error: 'createChannelData retornó null',
            extinf: entry.extinf,
            url: entry.url
          });
          continue;
        }
        
        console.log('   📊 Datos del canal creados:');
        console.log(`      ID: ${channelData.id}`);
        console.log(`      Nombre: ${channelData.name}`);
        console.log(`      URL: ${channelData.url}`);
        console.log(`      Grupo: ${channelData.group}`);
        console.log(`      País: ${channelData.country}`);
        console.log(`      Idioma: ${channelData.language}`);
        console.log(`      Calidad: ${channelData.quality}`);
        
        // Paso 3: Crear instancia de Channel
        console.log('   🏗️ Creando instancia de Channel...');
        const channel = new Channel(channelData);
        
        console.log('   ✅ Channel creado exitosamente');
        successCount++;
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        errorCount++;
        errors.push({
          entry: i + 1,
          error: error.message,
          extinf: entry.extinf,
          url: entry.url,
          stack: error.stack
        });
      }
    }
    
    // 5. Resumen
    console.log('\n📊 Resumen de creación de canales:');
    console.log('=' .repeat(50));
    console.log(`✅ Canales creados exitosamente: ${successCount}`);
    console.log(`❌ Errores: ${errorCount}`);
    console.log(`📈 Tasa de éxito: ${((successCount / Math.min(5, rawEntries.length)) * 100).toFixed(1)}%`);
    
    // 6. Detalles de errores
    if (errors.length > 0) {
      console.log('\n❌ Detalles de errores:');
      console.log('=' .repeat(50));
      
      errors.forEach((errorInfo, index) => {
        console.log(`\nError ${index + 1} (Entrada ${errorInfo.entry}):`);
        console.log(`   Mensaje: ${errorInfo.error}`);
        console.log(`   EXTINF: ${errorInfo.extinf}`);
        console.log(`   URL: ${errorInfo.url}`);
        if (errorInfo.stack) {
          console.log(`   Stack: ${errorInfo.stack.split('\n')[0]}`);
        }
      });
    }
    
    // 7. Probar con datos manuales
    console.log('\n🧪 Probando con datos manuales...');
    console.log('=' .repeat(50));
    
    try {
      const manualChannel = new Channel({
        id: Channel.generateId('Test Manual', Channel.TYPES.TV),
        name: 'Test Manual',
        url: 'https://ed21ov.live.opencaster.com/pAtGzcAnwziC/index.m3u8',
        group: Channel.GENRES.GENERAL,
        country: 'Perú',
        language: 'es',
        quality: 'Auto'
      });
      
      console.log('✅ Canal manual creado exitosamente');
      console.log(`   ID: ${manualChannel.id}`);
      console.log(`   Nombre: ${manualChannel.name}`);
      
    } catch (error) {
      console.log(`❌ Error creando canal manual: ${error.message}`);
    }
    
  } catch (error) {
    console.error('\n❌ Error durante el debug:');
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(`Stack: ${error.stack}`);
    }
  }
}

// Ejecutar debug
debugChannelCreation();