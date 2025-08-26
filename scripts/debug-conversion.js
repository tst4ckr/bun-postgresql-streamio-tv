#!/usr/bin/env node

/**
 * Script de depuración simple para conversión HTTPS a HTTP
 */

console.log('=== INICIANDO SCRIPT DE DEPURACIÓN ===');

try {
  console.log('1. Importando módulos...');
  
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');
  
  console.log('2. Configurando rutas...');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = dirname(__dirname);
  
  console.log(`Directorio del proyecto: ${projectRoot}`);
  
  console.log('3. Configurando variables de entorno...');
  process.env.CONVERT_HTTPS_TO_HTTP = 'true';
  process.env.VALIDATE_HTTP_CONVERSION = 'true';
  process.env.HTTP_CONVERSION_TIMEOUT = '5';
  process.env.CSV_PATH = join(projectRoot, 'data', 'channels.csv');
  
  console.log('4. Importando TVAddonConfig...');
  const { TVAddonConfig } = await import('../src/infrastructure/config/TVAddonConfig.js');
  
  console.log('5. Creando configuración...');
  const config = new TVAddonConfig();
  
  console.log('6. Verificando configuración de conversión:');
  console.log(`- Conversión habilitada: ${config.validation.convertHttpsToHttp}`);
  console.log(`- Validación habilitada: ${config.validation.validateHttpConversion}`);
  console.log(`- Timeout: ${config.validation.httpConversionTimeout}s`);
  
  console.log('7. Importando HttpsToHttpConversionService...');
  const { HttpsToHttpConversionService } = await import('../src/domain/services/HttpsToHttpConversionService.js');
  
  console.log('8. Creando logger simple...');
  const logger = {
    info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
    debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args)
  };
  
  console.log('9. Creando servicio de conversión...');
  const conversionService = new HttpsToHttpConversionService(config, logger);
  
  console.log('10. Probando conversión de URL simple...');
  const testUrl = 'https://example.com/stream.m3u8';
  const convertedUrl = conversionService.convertToHttp(testUrl);
  console.log(`URL original: ${testUrl}`);
  console.log(`URL convertida: ${convertedUrl}`);
  
  console.log('\n✅ SCRIPT DE DEPURACIÓN COMPLETADO EXITOSAMENTE');
  
} catch (error) {
  console.error('❌ Error en el script de depuración:', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}