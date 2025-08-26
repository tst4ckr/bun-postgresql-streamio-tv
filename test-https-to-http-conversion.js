/**
 * Script de prueba para verificar la funcionalidad de conversión HTTPS a HTTP
 */

import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';
import { HttpsToHttpConversionService } from './src/domain/services/HttpsToHttpConversionService.js';
import { StreamHealthService } from './src/infrastructure/services/StreamHealthService.js';
import { HybridChannelRepository } from './src/infrastructure/repositories/HybridChannelRepository.js';

// Logger simple
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

async function testHttpsToHttpConversion() {
  console.log('🔄 Iniciando prueba de conversión HTTPS a HTTP...');
  
  try {
    // Configurar variables de entorno para habilitar conversión
    process.env.CONVERT_HTTPS_TO_HTTP = 'true';
    process.env.VALIDATE_HTTP_CONVERSION = 'true';
    process.env.VALIDATE_STREAMS_ON_STARTUP = 'true';
    
    console.log('✅ Variables de entorno configuradas');
    
    // Cargar configuración
    const config = new TVAddonConfig();
    console.log('✅ Configuración cargada');
    console.log(`📊 Conversión HTTPS habilitada: ${config.validation.convertHttpsToHttp}`);
    console.log(`📊 Validación HTTP habilitada: ${config.validation.validateHttpConversion}`);
    console.log(`📊 Validación de streams: ${config.validation.validateStreamsOnStartup}`);
    
    // Crear instancia del servicio de salud de streams
    const streamHealthService = new StreamHealthService(config, logger);
    console.log('✅ StreamHealthService creado');
    
    // Crear instancia del servicio de conversión
    const httpsToHttpService = new HttpsToHttpConversionService(config, streamHealthService, logger);
    console.log('✅ HttpsToHttpConversionService creado');
    
    // Verificar que la conversión esté habilitada
    if (!httpsToHttpService.isEnabled()) {
      throw new Error('La conversión HTTPS a HTTP no está habilitada');
    }
    console.log('✅ Conversión HTTPS a HTTP confirmada como habilitada');
    
    // Configurar fuentes de datos
    const csvPath = config.dataSources.channelsFile;
    const m3uSources = [
      config.dataSources.m3uUrl,
      config.dataSources.backupM3uUrl,
      config.dataSources.localM3uLatam1,
      config.dataSources.localM3uLatam2,
      config.dataSources.localM3uLatam3,
      config.dataSources.localM3uLatam4,
      config.dataSources.localM3uLatam5
    ].filter(url => url && url.trim() !== '');
    
    console.log(`📁 CSV Path: ${csvPath}`);
    console.log(`📡 M3U Sources: ${m3uSources.length} fuentes configuradas`);
    
    // Crear repositorio híbrido
    const repository = new HybridChannelRepository(csvPath, m3uSources, config, logger);
    console.log('✅ HybridChannelRepository creado');
    
    // Obtener canales antes de la conversión
    console.log('\n🔍 Analizando canales antes de la conversión...');
    const channelsBefore = await repository.getAllChannels();
    console.log(`📊 Total de canales cargados: ${channelsBefore.length}`);
    
    // Contar canales HTTPS
    const httpsChannels = channelsBefore.filter(channel => 
      channel.streamUrl && channel.streamUrl.startsWith('https://')
    );
    console.log(`🔒 Canales con HTTPS: ${httpsChannels.length}`);
    
    // Mostrar algunos ejemplos de URLs HTTPS
    if (httpsChannels.length > 0) {
      console.log('\n📋 Ejemplos de URLs HTTPS encontradas:');
      httpsChannels.slice(0, 5).forEach((channel, index) => {
        console.log(`  ${index + 1}. ${channel.name}: ${channel.streamUrl}`);
      });
    }
    
    // Obtener todos los canales sin filtrar y aplicar conversión manualmente
    console.log('\n🔄 Obteniendo todos los canales y aplicando conversión HTTPS a HTTP...');
    const allChannels = await repository.getAllChannelsUnfiltered();
    
    // Aplicar conversión HTTPS a HTTP manualmente
    const conversionResult = await httpsToHttpService.processChannels(allChannels, {
      concurrency: 10,
      showProgress: true,
      onlyWorkingHttp: false // Obtener todos los canales, no solo los que funcionan
    });
    
    const processedChannels = conversionResult.processed
      .map(result => result.channel)
      .filter(channel => channel && channel.streamUrl); // Filtrar elementos válidos
    
    console.log(`\n📊 Canales procesados: ${processedChannels.length}`);
    
    // Contar canales HTTP después de la conversión
    const httpChannels = processedChannels.filter(channel => 
      channel.streamUrl.startsWith('http://')
    );
    console.log(`🔓 Canales convertidos a HTTP: ${httpChannels.length}`);
    
    // Contar canales HTTPS restantes
    const remainingHttpsChannels = processedChannels.filter(channel => 
      channel.streamUrl.startsWith('https://')
    );
    console.log(`🔒 Canales HTTPS restantes: ${remainingHttpsChannels.length}`);
    
    // Mostrar algunos ejemplos de URLs HTTP convertidas
    if (httpChannels.length > 0) {
      console.log('\n📋 Ejemplos de URLs HTTP convertidas:');
      httpChannels.slice(0, 5).forEach((channel, index) => {
        console.log(`  ${index + 1}. ${channel.name}: ${channel.streamUrl}`);
      });
    }
    
    // Usar estadísticas del resultado de conversión
    console.log('\n📈 Estadísticas finales:');
    console.log(`   • Canales procesados: ${conversionResult.stats.total}`);
    console.log(`   • Canales convertidos a HTTP: ${conversionResult.stats.converted}`);
    console.log(`   • Canales HTTP funcionales: ${conversionResult.stats.httpWorking}`);
    console.log(`   • Canales que fallaron: ${conversionResult.stats.failed}`);
    console.log(`   • Canales HTTPS restantes: ${conversionResult.stats.total - conversionResult.stats.converted}`);
    
    if (conversionResult.stats.converted > 0) {
      const conversionRate = ((conversionResult.stats.converted / conversionResult.stats.total) * 100).toFixed(1);
      const functionalRate = ((conversionResult.stats.httpWorking / conversionResult.stats.converted) * 100).toFixed(1);
      console.log(`   • Tasa de conversión: ${conversionRate}%`);
      console.log(`   • Tasa de funcionalidad HTTP: ${functionalRate}%`);
      console.log('\n✅ ¡Conversión HTTPS a HTTP exitosa!');
    } else {
      console.log('\n⚠️  No se convirtieron canales HTTPS a HTTP');
    }
    
  } catch (error) {
    console.error('❌ Error durante la prueba:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Ejecutar la prueba
testHttpsToHttpConversion().then(() => {
  console.log('\n🎉 Prueba completada exitosamente');
  process.exit(0);
}).catch(error => {
  console.error('💥 Error fatal:', error);
  process.exit(1);
});