/**
 * Script para debuggear la validación de URLs
 * Prueba las URLs del M3U contra la validación de Channel
 */

import { Channel } from './src/domain/entities/Channel.js';
import fetch from 'node-fetch';

// Función para probar la validación de URL
function testUrlValidation(url) {
  try {
    const urlObj = new URL(url);
    const validProtocols = ['http:', 'https:', 'rtmp:', 'rtmps:'];
    const validExtensions = ['.m3u8', '.m3u', '.ts'];
    
    const hasValidProtocol = validProtocols.includes(urlObj.protocol);
    const hasValidExtension = validExtensions.some(ext => url.toLowerCase().includes(ext));
    const hasStreamKeyword = url.toLowerCase().includes('stream');
    
    const isValid = hasValidProtocol || hasValidExtension || hasStreamKeyword;
    
    return {
      url,
      protocol: urlObj.protocol,
      hasValidProtocol,
      hasValidExtension,
      hasStreamKeyword,
      isValid,
      hostname: urlObj.hostname,
      pathname: urlObj.pathname
    };
  } catch (error) {
    return {
      url,
      error: error.message,
      isValid: false
    };
  }
}

async function debugUrlValidation() {
  const m3uUrl = 'https://iptv-org.github.io/iptv/countries/pe.m3u';
  
  console.log('🔍 Debuggeando validación de URLs');
  console.log('=' .repeat(60));
  
  try {
    // Descargar M3U
    const response = await fetch(m3uUrl);
    const content = await response.text();
    
    // Extraer URLs del M3U
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    const urls = lines.filter(line => 
      line.startsWith('http://') || line.startsWith('https://')
    );
    
    console.log(`📊 URLs encontradas en M3U: ${urls.length}`);
    console.log('\n🔍 Probando validación de URLs:');
    console.log('=' .repeat(60));
    
    let validCount = 0;
    let invalidCount = 0;
    
    // Probar primeras 10 URLs
    const testUrls = urls.slice(0, 10);
    
    testUrls.forEach((url, index) => {
      const result = testUrlValidation(url);
      
      console.log(`\n📋 URL ${index + 1}:`);
      console.log(`   URL: ${result.url}`);
      
      if (result.error) {
        console.log(`   ❌ Error: ${result.error}`);
        invalidCount++;
      } else {
        console.log(`   🌐 Protocolo: ${result.protocol} (válido: ${result.hasValidProtocol})`);
        console.log(`   📁 Extensión válida: ${result.hasValidExtension}`);
        console.log(`   🔄 Contiene 'stream': ${result.hasStreamKeyword}`);
        console.log(`   ✅ Resultado: ${result.isValid ? 'VÁLIDA' : 'INVÁLIDA'}`);
        
        if (result.isValid) {
          validCount++;
        } else {
          invalidCount++;
        }
      }
    });
    
    console.log('\n📊 Resumen de validación:');
    console.log('=' .repeat(40));
    console.log(`✅ URLs válidas: ${validCount}`);
    console.log(`❌ URLs inválidas: ${invalidCount}`);
    console.log(`📈 Tasa de éxito: ${((validCount / testUrls.length) * 100).toFixed(1)}%`);
    
    // Probar creación de Channel con una URL válida
    if (validCount > 0) {
      console.log('\n🔄 Probando creación de Channel...');
      const validUrl = testUrls.find(url => testUrlValidation(url).isValid);
      
      try {
        const channel = new Channel({
          id: Channel.generateId('Test Channel', Channel.TYPES.TV),
          name: 'Test Channel',
          streamUrl: validUrl,
          genre: Channel.GENRES.GENERAL
        });
        
        console.log('✅ Channel creado exitosamente:');
        console.log(`   ID: ${channel.id}`);
        console.log(`   Nombre: ${channel.name}`);
        console.log(`   URL: ${channel.streamUrl}`);
        
      } catch (error) {
        console.log(`❌ Error creando Channel: ${error.message}`);
      }
    }
    
    // Analizar URLs inválidas
    if (invalidCount > 0) {
      console.log('\n🔍 Análisis de URLs inválidas:');
      console.log('=' .repeat(40));
      
      const invalidUrls = testUrls.filter(url => !testUrlValidation(url).isValid);
      
      invalidUrls.forEach((url, index) => {
        const result = testUrlValidation(url);
        console.log(`\n❌ URL inválida ${index + 1}:`);
        console.log(`   ${url}`);
        console.log(`   Razón: No cumple criterios de validación`);
        if (!result.error) {
          console.log(`   - Protocolo ${result.protocol}: ${result.hasValidProtocol ? 'OK' : 'NO'}`);
          console.log(`   - Extensión válida: ${result.hasValidExtension ? 'OK' : 'NO'}`);
          console.log(`   - Contiene 'stream': ${result.hasStreamKeyword ? 'OK' : 'NO'}`);
        }
      });
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
debugUrlValidation();