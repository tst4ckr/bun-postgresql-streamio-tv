/**
 * Script de prueba para verificar el filtrado de canales con streams HTTP funcionales
 */

import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';
import { HybridChannelRepository } from './src/infrastructure/repositories/HybridChannelRepository.js';

// Logger simple
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.log(`[WARN] ${msg}`),
  error: (msg) => console.log(`[ERROR] ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

async function testFilterWorkingChannels() {
  console.log('🔄 Iniciando prueba de filtrado de canales funcionales...');
  
  try {
    // Configurar variables de entorno para habilitar conversión y filtrado
    process.env.CONVERT_HTTPS_TO_HTTP = 'true';
    process.env.VALIDATE_HTTP_CONVERSION = 'true';
    process.env.VALIDATE_STREAMS_ON_STARTUP = 'true';
    
    console.log('✅ Variables de entorno configuradas');
    
    // Cargar configuración
    const config = new TVAddonConfig();
    console.log('✅ Configuración cargada');
    console.log(`📊 Conversión HTTPS habilitada: ${config.validation.convertHttpsToHttp}`);
    console.log(`📊 Validación HTTP habilitada: ${config.validation.validateHttpConversion}`);
    
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
    
    // Obtener todos los canales sin filtrar
    console.log('\n🔍 Obteniendo todos los canales sin filtrar...');
    const allChannels = await repository.getAllChannelsUnfiltered();
    console.log(`📊 Total de canales sin filtrar: ${allChannels.length}`);
    
    // Contar canales HTTPS originales
    const httpsChannels = allChannels.filter(channel => 
      channel.streamUrl && channel.streamUrl.startsWith('https://')
    );
    console.log(`🔒 Canales HTTPS originales: ${httpsChannels.length}`);
    
    // Obtener canales filtrados (solo funcionales)
    console.log('\n🔄 Obteniendo canales filtrados (solo funcionales)...');
    const filteredChannels = await repository.getAllChannels();
    console.log(`📊 Total de canales filtrados: ${filteredChannels.length}`);
    
    // Analizar tipos de URLs en canales filtrados
    const httpChannels = filteredChannels.filter(channel => 
      channel.streamUrl && channel.streamUrl.startsWith('http://')
    );
    const httpsChannelsFiltered = filteredChannels.filter(channel => 
      channel.streamUrl && channel.streamUrl.startsWith('https://')
    );
    
    console.log(`🔓 Canales HTTP funcionales: ${httpChannels.length}`);
    console.log(`🔒 Canales HTTPS funcionales: ${httpsChannelsFiltered.length}`);
    
    // Calcular estadísticas de filtrado
    const totalRemoved = allChannels.length - filteredChannels.length;
    const removalPercentage = ((totalRemoved / allChannels.length) * 100).toFixed(1);
    const functionalPercentage = ((filteredChannels.length / allChannels.length) * 100).toFixed(1);
    
    console.log('\n📈 Estadísticas de filtrado:');
    console.log(`   • Canales originales: ${allChannels.length}`);
    console.log(`   • Canales funcionales: ${filteredChannels.length}`);
    console.log(`   • Canales removidos: ${totalRemoved}`);
    console.log(`   • Porcentaje removido: ${removalPercentage}%`);
    console.log(`   • Porcentaje funcional: ${functionalPercentage}%`);
    
    // Mostrar algunos ejemplos de canales funcionales
    if (filteredChannels.length > 0) {
      console.log('\n📋 Ejemplos de canales funcionales:');
      filteredChannels.slice(0, 10).forEach((channel, index) => {
        const urlType = channel.streamUrl.startsWith('https://') ? 'HTTPS' : 'HTTP';
        console.log(`  ${index + 1}. [${urlType}] ${channel.name}: ${channel.streamUrl}`);
      });
    }
    
    // Verificar que todos los canales filtrados tienen URLs válidas
    const invalidChannels = filteredChannels.filter(channel => 
      !channel.streamUrl || (!channel.streamUrl.startsWith('http://') && !channel.streamUrl.startsWith('https://'))
    );
    
    if (invalidChannels.length === 0) {
      console.log('\n✅ ¡Todos los canales filtrados tienen URLs válidas!');
    } else {
      console.log(`\n⚠️  Se encontraron ${invalidChannels.length} canales con URLs inválidas`);
    }
    
    // Verificar eficiencia del filtrado
    if (filteredChannels.length > 0) {
      const httpConversionRate = ((httpChannels.length / filteredChannels.length) * 100).toFixed(1);
      console.log(`\n📊 Tasa de conversión HTTP en canales funcionales: ${httpConversionRate}%`);
      
      console.log('\n✅ ¡Filtrado de canales funcionales exitoso!');
    } else {
      console.log('\n⚠️  No se encontraron canales funcionales');
    }
    
  } catch (error) {
    console.error('❌ Error durante la prueba:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Ejecutar la prueba
testFilterWorkingChannels().then(() => {
  console.log('\n🎉 Prueba completada exitosamente');
  process.exit(0);
}).catch(error => {
  console.error('💥 Error fatal:', error);
  process.exit(1);
});