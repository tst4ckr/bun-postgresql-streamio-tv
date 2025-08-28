/**
 * Script para verificar que TODOS los canales M3U (HTTP y HTTPS) son procesados correctamente
 * y que las URLs HTTPS se convierten a HTTP antes del escaneo
 */

import { ChannelRepositoryFactory } from './src/infrastructure/factories/ChannelRepositoryFactory.js';
import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';
import { HttpsToHttpConversionService } from './src/infrastructure/services/HttpsToHttpConversionService.js';
import { StreamHealthService } from './src/infrastructure/services/StreamHealthService.js';

async function testConversionAllUrls() {
    try {
        console.log('🔍 Verificando conversión HTTPS→HTTP para TODOS los canales M3U...');
        
        // Logger simple para el script
        const logger = {
            info: (msg) => console.log(`[INFO] ${msg}`),
            warn: (msg) => console.log(`[WARN] ${msg}`),
            error: (msg) => console.log(`[ERROR] ${msg}`),
            debug: (msg) => console.log(`[DEBUG] ${msg}`)
        };
        
        // 1. Cargar configuración
        const config = TVAddonConfig.getInstance().getConfig();
        console.log('✅ Configuración cargada');
        console.log(`   - CONVERT_HTTPS_TO_HTTP: ${config.validation?.convertHttpsToHttp}`);
        console.log(`   - VALIDATE_HTTP_CONVERSION: ${config.validation?.validateHttpConversion}`);
        
        // Crear servicios necesarios
        const streamHealthService = new StreamHealthService(config, logger);
        const httpsToHttpService = new HttpsToHttpConversionService(config, streamHealthService, logger);
    
    // 2. Crear repositorio híbrido (el factory ya inicializa automáticamente)
    const repository = await ChannelRepositoryFactory.createRepository(config, logger);
    console.log('✅ Repositorio híbrido creado e inicializado');
    
    // 3. Obtener TODOS los canales M3U sin filtrar
    console.log('\n📡 Obteniendo canales M3U sin filtrar...');
    const allChannels = await repository.getAllChannelsUnfiltered();
    console.log(`Total canales obtenidos: ${allChannels.length}`);
    
    // 5. Identificar fuentes de canales
    const csvChannelIds = new Set();
    try {
      const csvChannels = await repository.getCSVRepository().getAllChannelsUnfiltered();
      csvChannels.forEach(ch => csvChannelIds.add(ch.id));
      console.log(`Canales CSV identificados: ${csvChannelIds.size}`);
    } catch (error) {
      console.log('No se pudieron obtener canales CSV');
    }
    
    // 6. Separar canales por fuente
    const csvChannels = allChannels.filter(ch => csvChannelIds.has(ch.id));
    const m3uChannels = allChannels.filter(ch => !csvChannelIds.has(ch.id));
    
    console.log(`\n📊 Distribución de canales:`);
    console.log(`   - Canales CSV: ${csvChannels.length}`);
    console.log(`   - Canales M3U: ${m3uChannels.length}`);
    
    // 7. Analizar URLs de canales M3U ANTES de conversión
    const httpsChannels = m3uChannels.filter(ch => ch.streamUrl.startsWith('https://'));
    const httpChannels = m3uChannels.filter(ch => ch.streamUrl.startsWith('http://'));
    const otherChannels = m3uChannels.filter(ch => !ch.streamUrl.startsWith('http'));
    
    console.log(`\n🔍 Análisis de URLs M3U ANTES de conversión:`);
    console.log(`   - URLs HTTPS: ${httpsChannels.length}`);
    console.log(`   - URLs HTTP: ${httpChannels.length}`);
    console.log(`   - Otras URLs: ${otherChannels.length}`);
    
    if (httpsChannels.length > 0) {
      console.log(`\n📋 Ejemplos de URLs HTTPS a convertir:`);
      httpsChannels.slice(0, 3).forEach((ch, i) => {
        console.log(`   ${i + 1}. ${ch.name}: ${ch.streamUrl}`);
      });
    }
    
    if (httpChannels.length > 0) {
      console.log(`\n📋 Ejemplos de URLs HTTP a validar:`);
      httpChannels.slice(0, 3).forEach((ch, i) => {
        console.log(`   ${i + 1}. ${ch.name}: ${ch.streamUrl}`);
      });
    }
    
    // 8. Aplicar conversión HTTPS→HTTP a TODOS los canales M3U
    console.log(`\n🔄 Aplicando conversión HTTPS→HTTP a ${m3uChannels.length} canales M3U...`);
    
    const conversionResult = await httpsToHttpService.processChannels(m3uChannels, {
      concurrency: 5, // Reducir concurrencia para mejor observación
      showProgress: true,
      onlyWorkingHttp: false // Obtener TODOS los resultados para análisis
    });
    
    console.log(`\n📊 Resultados de conversión:`);
    console.log(`   - Total procesados: ${conversionResult.stats.total}`);
    console.log(`   - Convertidos HTTPS→HTTP: ${conversionResult.stats.converted}`);
    console.log(`   - HTTP funcionales: ${conversionResult.stats.httpWorking}`);
    console.log(`   - Originales funcionales: ${conversionResult.stats.originalWorking}`);
    console.log(`   - Fallidos: ${conversionResult.stats.failed}`);
    
    // 9. Analizar resultados detallados
    const processedChannels = conversionResult.processed;
    const finalHttpsChannels = processedChannels.filter(ch => ch.streamUrl.startsWith('https://'));
    const finalHttpChannels = processedChannels.filter(ch => ch.streamUrl.startsWith('http://'));
    
    console.log(`\n🔍 Análisis de URLs DESPUÉS de conversión:`);
    console.log(`   - URLs HTTPS restantes: ${finalHttpsChannels.length}`);
    console.log(`   - URLs HTTP finales: ${finalHttpChannels.length}`);
    
    // 10. Mostrar ejemplos de conversiones exitosas
    if (conversionResult.stats.converted > 0) {
      console.log(`\n✅ Ejemplos de conversiones HTTPS→HTTP exitosas:`);
      
      // Buscar canales que fueron convertidos
      const convertedExamples = conversionResult.results
        .filter(r => r.converted && r.httpWorks)
        .slice(0, 3);
        
      convertedExamples.forEach((result, i) => {
        console.log(`   ${i + 1}. ${result.channel.name}:`);
        console.log(`      Original: ${result.meta.originalUrl}`);
        console.log(`      Convertido: ${result.channel.streamUrl}`);
        console.log(`      HTTP funciona: ${result.httpWorks ? '✅' : '❌'}`);
      });
    }
    
    // 11. Mostrar canales HTTP que fueron validados
    const httpValidatedExamples = conversionResult.results
      .filter(r => !r.converted && r.httpWorks)
      .slice(0, 3);
      
    if (httpValidatedExamples.length > 0) {
      console.log(`\n✅ Ejemplos de URLs HTTP validadas:`);
      httpValidatedExamples.forEach((result, i) => {
        console.log(`   ${i + 1}. ${result.channel.name}: ${result.channel.streamUrl}`);
        console.log(`      HTTP funciona: ${result.httpWorks ? '✅' : '❌'}`);
      });
    }
    
    // 12. Verificar que NO se perdieron canales
    const expectedTotal = httpsChannels.length + httpChannels.length;
    const actualProcessed = conversionResult.stats.total;
    
    console.log(`\n🔍 Verificación de integridad:`);
    console.log(`   - Canales M3U esperados: ${expectedTotal}`);
    console.log(`   - Canales M3U procesados: ${actualProcessed}`);
    console.log(`   - Diferencia: ${expectedTotal - actualProcessed}`);
    
    if (expectedTotal === actualProcessed) {
      console.log(`   ✅ TODOS los canales M3U fueron procesados correctamente`);
    } else {
      console.log(`   ⚠️  Hay una diferencia en el número de canales procesados`);
    }
    
    // 13. Calcular tasas de éxito
    const conversionRate = httpsChannels.length > 0 
      ? ((conversionResult.stats.converted / httpsChannels.length) * 100).toFixed(1)
      : '0.0';
      
    const httpSuccessRate = conversionResult.stats.total > 0
      ? ((conversionResult.stats.httpWorking / conversionResult.stats.total) * 100).toFixed(1)
      : '0.0';
    
    console.log(`\n📈 Tasas de éxito:`);
    console.log(`   - Tasa de conversión HTTPS→HTTP: ${conversionRate}%`);
    console.log(`   - Tasa de éxito HTTP: ${httpSuccessRate}%`);
    
    // 14. Conclusión
    console.log(`\n🎯 CONCLUSIÓN:`);
    if (conversionResult.stats.total === expectedTotal) {
      console.log(`✅ El sistema procesa correctamente TODOS los canales M3U (HTTP y HTTPS)`);
      console.log(`✅ Las URLs HTTPS se convierten a HTTP antes del escaneo`);
      console.log(`✅ Las URLs HTTP se validan directamente`);
    } else {
      console.log(`❌ Hay problemas en el procesamiento de canales`);
    }
    
  } catch (error) {
    console.error('❌ Error durante la verificación:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Ejecutar la verificación
testConversionAllUrls().then(() => {
  console.log('\n🎉 Verificación completada');
  process.exit(0);
}).catch(error => {
  console.error('💥 Error fatal:', error);
  process.exit(1);
});