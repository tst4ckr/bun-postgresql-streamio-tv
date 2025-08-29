/**
 * @fileoverview Script de prueba para el modo automático
 * Valida el funcionamiento del AutomaticChannelRepository
 */

import { AutomaticChannelRepository } from '../src/infrastructure/repositories/AutomaticChannelRepository.js';
import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';

/**
 * Logger para pruebas
 */
const logger = console;

/**
 * Configuración de prueba para modo automático
 */
const testEnvConfig = {
  CHANNELS_SOURCE: 'automatic',
  AUTO_M3U_URL: 'https://iptv-org.github.io/iptv/index.m3u',
  
  // Configuración mínima requerida
  SERVER_PORT: 3000,
  ADDON_ID: 'org.test.automatic-mode',
  ADDON_NAME: 'Test Automatic Mode',
  ADDON_DESCRIPTION: 'Prueba del modo automático',
  
  // Configuración de filtros
  FILTER_ADULT_CONTENT: 'false',
  FILTER_BY_COUNTRY: '',
  FILTER_BY_LANGUAGE: '',
  FILTER_BY_KEYWORDS: '',
  
  // Configuración de streaming
  CACHE_CHANNELS_HOURS: '24',
  VALIDATE_STREAMS: 'false',
  CONVERT_HTTPS_TO_HTTP: 'true'
};

/**
 * Función principal de prueba
 */
async function testAutomaticMode() {
  try {
    console.log('🤖 Iniciando prueba del modo automático\n');
    
    // URL de prueba de iptv-org
    const testUrl = 'https://iptv-org.github.io/iptv/index.m3u';
    
    console.log(`📥 URL de prueba: ${testUrl}`);
    console.log('=' .repeat(80));
    
    // Establecer variables de entorno para la prueba
    Object.assign(process.env, testEnvConfig);
    
    // Crear configuración
    const config = new TVAddonConfig();
    
    // Crear repositorio automático
    const repository = new AutomaticChannelRepository(config, logger);
    
    // Inicializar repositorio (esto ejecuta todo el proceso automático)
    console.log('\n🔄 Inicializando repositorio automático...');
    await repository.initialize();
    
    // Obtener información del repositorio
    const repoInfo = repository.getRepositoryInfo();
    console.log('\n📊 Información del repositorio automático:');
    console.log('=' .repeat(50));
    console.log(`Tipo: ${repoInfo.type}`);
    console.log(`Fuente: ${repoInfo.source}`);
    console.log(`Total de canales: ${repoInfo.channelsCount}`);
    console.log(`Última actualización: ${repoInfo.lastUpdate}`);
    console.log(`Inicializado: ${repoInfo.isInitialized}`);
    
    // Obtener canales para análisis
    const channels = await repository.getAllChannels();
    
    // Analizar URLs generadas
    const uniqueUrls = new Set(channels.map(ch => ch.url));
    console.log('\n🔗 URLs de playlist generadas:');
    console.log('=' .repeat(50));
    if (uniqueUrls.size > 0) {
      Array.from(uniqueUrls).slice(0, 10).forEach((url, index) => {
        console.log(`${index + 1}. ${url}`);
      });
      if (uniqueUrls.size > 10) {
        console.log(`... y ${uniqueUrls.size - 10} más`);
      }
    } else {
      console.log('No se encontraron URLs de playlist válidas');
    }
    
    // Mostrar canales de muestra
    console.log('\n📺 Canales de muestra (primeros 5):');
    console.log('=' .repeat(50));
    if (channels.length > 0) {
      channels.slice(0, 5).forEach((channel, index) => {
        console.log(`${index + 1}. ${channel.name}`);
        console.log(`   ID: ${channel.id}`);
        console.log(`   URL: ${channel.url}`);
        console.log(`   País: ${channel.country || 'N/A'}`);
        console.log(`   Idioma: ${channel.language || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('No se encontraron canales válidos');
    }
    
    // Resumen final
    console.log('\n✅ Prueba del modo automático completada');
    console.log('=' .repeat(50));
    console.log(`✓ URLs de playlist extraídas: ${uniqueUrls.size}`);
    console.log(`✓ Canales procesados: ${channels.length}`);
    console.log(`✓ Proceso automático: ${repoInfo.isInitialized ? 'EXITOSO' : 'FALLIDO'}`);
    
    if (uniqueUrls.size === 0) {
      console.log('\n⚠️  ADVERTENCIA: No se encontraron URLs con "/play/" e IPs públicas');
      console.log('   Esto puede ser normal si la fuente M3U no contiene este tipo de URLs');
    }
    
    if (channels.length === 0) {
      console.log('\n⚠️  ADVERTENCIA: No se procesaron canales válidos');
      console.log('   Verifique que las URLs de playlist generadas sean accesibles');
    }
    
  } catch (error) {
    console.error('\n❌ Error durante la prueba del modo automático:');
    console.error('=' .repeat(50));
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(`Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

/**
 * Función de prueba con configuración de entorno simulada
 */
async function testWithEnvironmentConfig() {
  try {
    console.log('\n🔧 Probando con configuración de entorno simulada...');
    
    // Simular variables de entorno
    const envConfig = {
      ...testEnvConfig,
      CHANNELS_SOURCE: 'automatic',
      AUTO_M3U_URL: 'https://iptv-org.github.io/iptv/index.m3u'
    };
    
    // Establecer variables de entorno
    Object.assign(process.env, envConfig);
    
    // Crear configuración usando TVAddonConfig
    const config = new TVAddonConfig();
    
    console.log(`Fuente de canales: ${config.dataSources.channelsSource}`);
    console.log(`URL M3U automática: ${config.dataSources.autoM3uUrl}`);
    
    // Crear repositorio con configuración real
    const repository = new AutomaticChannelRepository(config, logger);
    
    await repository.initialize();
    
    const repoInfo = repository.getRepositoryInfo();
    console.log(`\n✅ Configuración de entorno validada: ${repoInfo.channelsCount} canales procesados`);
    
  } catch (error) {
    console.error(`\n❌ Error con configuración de entorno: ${error.message}`);
  }
}

// Ejecutar pruebas directamente
(async () => {
  try {
    await testAutomaticMode();
    await testWithEnvironmentConfig();
    console.log('\n🎉 Todas las pruebas completadas exitosamente');
  } catch (error) {
    console.error('\n💥 Error en las pruebas:', error);
    process.exit(1);
  }
})();

export { testAutomaticMode, testWithEnvironmentConfig };