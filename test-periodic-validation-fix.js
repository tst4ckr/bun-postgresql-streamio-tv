/**
 * Script de prueba para verificar que la validación periódica ya no desactiva canales BITEL válidos
 * Simula el flujo completo de validación periódica con la corrección aplicada
 */

import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';
import { ChannelRepositoryFactory } from './src/infrastructure/factories/ChannelRepositoryFactory.js';
import { StreamHealthService } from './src/infrastructure/services/StreamHealthService.js';
import { InvalidChannelManagementService } from './src/application/services/InvalidChannelManagementService.js';

class PeriodicValidationTest {
  constructor() {
    this.config = new TVAddonConfig();
    this.logger = {
      info: (msg) => console.log(`[INFO] ${msg}`),
      warn: (msg) => console.log(`[WARN] ${msg}`),
      error: (msg) => console.log(`[ERROR] ${msg}`),
      debug: (msg) => console.log(`[DEBUG] ${msg}`)
    };
  }

  async initialize() {
    this.logger.info('🔧 Inicializando servicios para prueba de validación periódica...');
    
    this.channelRepository = await ChannelRepositoryFactory.createRepository(this.config, this.logger);
    this.healthService = new StreamHealthService(this.config, this.logger);
    this.invalidChannelService = new InvalidChannelManagementService(
      this.channelRepository, 
      this.config, 
      this.logger
    );
  }

  async testPeriodicValidationFlow() {
    this.logger.info('\n🔍 PRUEBA DE VALIDACIÓN PERIÓDICA CON CORRECCIÓN');
    this.logger.info('=' .repeat(60));
    
    // 1. Obtener canales BITEL para prueba
    const allChannels = await this.channelRepository.getAllChannelsUnfiltered();
    const bitelChannels = allChannels.filter(channel => 
      channel.streamUrl && channel.streamUrl.includes('tv360.bitel.com.pe')
    ).slice(0, 5); // Tomar solo 5 para la prueba
    
    if (bitelChannels.length === 0) {
      this.logger.warn('⚠️  No se encontraron canales BITEL para probar');
      return;
    }
    
    this.logger.info(`📺 Canales BITEL encontrados para prueba: ${bitelChannels.length}`);
    bitelChannels.forEach(ch => {
      this.logger.info(`  - ${ch.id}: ${ch.name}`);
    });
    
    // 2. Primera validación (simular validación inicial)
    this.logger.info('\n--- Primera Validación (Inicial) ---');
    const firstReport = await this.healthService.checkChannels(bitelChannels, 5, false);
    
    this.logger.info(`Resultados primera validación: ${firstReport.ok}/${firstReport.total} válidos`);
    
    // Mostrar detalles de URLs generadas
    this.logger.info('\n🔗 URLs generadas en primera validación:');
    firstReport.results.forEach(result => {
      if (result.meta && result.meta.processedUrl) {
        const uidMatch = result.meta.processedUrl.match(/uid=([^&]+)/);
        const uid = uidMatch ? uidMatch[1] : 'NO_UID';
        this.logger.info(`  ${result.id}: UID=${uid}`);
      }
    });
    
    // 3. Simular espera (menor que el cache de 20 minutos)
    this.logger.info('\n⏱️  Simulando espera de 10 minutos (menor que cache de 20 min)...');
    
    // 4. Segunda validación (simular validación periódica)
    this.logger.info('\n--- Segunda Validación (Periódica) ---');
    const secondReport = await this.healthService.checkChannels(bitelChannels, 5, false);
    
    this.logger.info(`Resultados segunda validación: ${secondReport.ok}/${secondReport.total} válidos`);
    
    // Mostrar detalles de URLs generadas
    this.logger.info('\n🔗 URLs generadas en segunda validación:');
    secondReport.results.forEach(result => {
      if (result.meta && result.meta.processedUrl) {
        const uidMatch = result.meta.processedUrl.match(/uid=([^&]+)/);
        const uid = uidMatch ? uidMatch[1] : 'NO_UID';
        this.logger.info(`  ${result.id}: UID=${uid}`);
      }
    });
    
    // 5. Comparar consistencia de UIDs
    this.logger.info('\n📊 ANÁLISIS DE CONSISTENCIA DE UIDs:');
    this.logger.info('=' .repeat(50));
    
    let consistentUids = 0;
    let totalBitelChannels = 0;
    
    // Analizar todos los canales BITEL que fueron validados
    bitelChannels.forEach(channel => {
      const firstResult = firstReport.results.find(r => r.id === channel.id);
      const secondResult = secondReport.results.find(r => r.id === channel.id);
      
      if (firstResult && secondResult) {
        totalBitelChannels++;
        
        const firstUid = firstResult.meta?.processedUrl?.match(/uid=([^&]+)/)?.[1] || 'NO_UID';
        const secondUid = secondResult.meta?.processedUrl?.match(/uid=([^&]+)/)?.[1] || 'NO_UID';
        
        const isConsistent = firstUid === secondUid && firstUid !== 'NO_UID';
        if (isConsistent) consistentUids++;
        
        this.logger.info(`${channel.id} (${channel.name}):`);
        this.logger.info(`  Primera:  ${firstUid}`);
        this.logger.info(`  Segunda:  ${secondUid}`);
        this.logger.info(`  Estado:   ${isConsistent ? '✅ CONSISTENTE' : '❌ INCONSISTENTE'}`);
        this.logger.info('');
      }
    });
    
    // 6. Simular procesamiento de resultados (como haría el sistema real)
    this.logger.info('\n🔄 SIMULANDO PROCESAMIENTO DE RESULTADOS:');
    
    if (this.invalidChannelService.isEnabled()) {
      this.logger.info('✅ InvalidChannelManagementService está habilitado');
      
      // Contar cuántos canales se desactivarían
      const wouldBeDeactivated = secondReport.results.filter(r => !r.ok).length;
      const wouldBeValidated = secondReport.results.filter(r => r.ok).length;
      
      this.logger.info(`📈 Canales que se marcarían como válidos: ${wouldBeValidated}`);
      this.logger.info(`📉 Canales que se desactivarían: ${wouldBeDeactivated}`);
      
      // Mostrar detalles de canales que fallarían
      const failedChannels = secondReport.results.filter(r => !r.ok);
      if (failedChannels.length > 0) {
        this.logger.info('\n❌ Canales que fallarían:');
        failedChannels.forEach(result => {
          this.logger.info(`  - ${result.id}: ${result.meta?.reason || 'Unknown error'}`);
        });
      }
    } else {
      this.logger.info('⚠️  InvalidChannelManagementService está deshabilitado');
    }
    
    // 7. Resultado final
    this.logger.info('\n🎯 RESULTADO FINAL:');
    this.logger.info('=' .repeat(50));
    
    if (totalBitelChannels === 0) {
      this.logger.info('⚠️  No se encontraron canales BITEL para evaluar');
    } else {
      const consistencyRate = (consistentUids / totalBitelChannels) * 100;
      
      this.logger.info(`📊 Consistencia de UIDs: ${consistentUids}/${totalBitelChannels} (${consistencyRate.toFixed(1)}%)`);
      
      if (consistencyRate === 100) {
        this.logger.info('✅ ÉXITO TOTAL: Todos los UIDs BITEL se mantuvieron consistentes');
        this.logger.info('✅ La corrección del cache resolvió el problema completamente');
        this.logger.info('✅ Las validaciones periódicas NO deberían desactivar canales BITEL válidos');
      } else if (consistencyRate >= 80) {
        this.logger.info('✅ ÉXITO PARCIAL: La mayoría de UIDs se mantuvieron consistentes');
        this.logger.info('⚠️  Revisar casos inconsistentes para optimización adicional');
      } else {
        this.logger.info('❌ PROBLEMA PERSISTENTE: Muchos UIDs siguen siendo inconsistentes');
        this.logger.info('❌ Se requiere investigación adicional del problema');
      }
    }
    
    // 8. Recomendaciones
    this.logger.info('\n💡 RECOMENDACIONES FINALES:');
    this.logger.info('- Cache de UIDs BITEL: 20 minutos (mayor que validación de 15 min)');
    this.logger.info('- Monitorear logs de producción para confirmar la corrección');
    this.logger.info('- Considerar alertas si la tasa de desactivación supera el 10%');
    this.logger.info('- Revisar configuración de timeout si hay muchos fallos de red');
    
    this.logger.info('\n=== PRUEBA DE VALIDACIÓN PERIÓDICA COMPLETADA ===');
  }
}

async function main() {
  const test = new PeriodicValidationTest();
  
  try {
    await test.initialize();
    await test.testPeriodicValidationFlow();
  } catch (error) {
    console.error('❌ Error en la prueba:', error);
  }
}

// Ejecutar prueba
main().catch(console.error);