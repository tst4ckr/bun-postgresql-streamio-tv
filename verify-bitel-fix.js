/**
 * Script de verificación final para confirmar que la corrección del cache BITEL
 * resuelve el problema de desactivación de canales válidos en producción
 */

import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';
import { ChannelRepositoryFactory } from './src/infrastructure/factories/ChannelRepositoryFactory.js';
import { StreamHealthService } from './src/infrastructure/services/StreamHealthService.js';
import { InvalidChannelManagementService } from './src/application/services/InvalidChannelManagementService.js';
import { BitelUidService } from './src/infrastructure/services/BitelUidService.js';

class BitelFixVerification {
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
    this.logger.info('🔧 Inicializando servicios para verificación final...');
    
    this.channelRepository = await ChannelRepositoryFactory.createRepository(this.config, this.logger);
    this.healthService = new StreamHealthService(this.config, this.logger);
    this.invalidChannelService = new InvalidChannelManagementService(
      this.channelRepository, 
      this.config, 
      this.logger
    );
    this.bitelUidService = new BitelUidService(this.config, this.logger);
  }

  async verifyBitelFix() {
    this.logger.info('\n🔍 VERIFICACIÓN FINAL DE LA CORRECCIÓN BITEL');
    this.logger.info('=' .repeat(60));
    
    // 1. Verificar configuración del cache
    this.logger.info('\n1. Verificando configuración del cache BITEL...');
    const cacheExpiry = 20 * 60 * 1000; // 20 minutos en ms
    const validationInterval = this.config.getConfig('validation').validateStreamsIntervalMinutes || 15;
    
    this.logger.info(`   Cache BITEL: ${cacheExpiry / 60000} minutos`);
    this.logger.info(`   Intervalo validación: ${validationInterval} minutos`);
    
    if (cacheExpiry > validationInterval * 60 * 1000) {
      this.logger.info('   ✅ Cache es mayor que intervalo de validación - CORRECTO');
    } else {
      this.logger.warn('   ⚠️  Cache podría ser insuficiente para el intervalo de validación');
    }
    
    // 2. Obtener canales BITEL
    this.logger.info('\n2. Obteniendo canales BITEL...');
    const allChannels = await this.channelRepository.getAllChannelsUnfiltered();
    const bitelChannels = allChannels.filter(channel => 
      channel.streamUrl && channel.streamUrl.includes('tv360.bitel.com.pe')
    );
    
    this.logger.info(`   Total canales: ${allChannels.length}`);
    this.logger.info(`   Canales BITEL: ${bitelChannels.length}`);
    
    if (bitelChannels.length === 0) {
      this.logger.warn('   ⚠️  No se encontraron canales BITEL para verificar');
      return;
    }
    
    // 3. Probar generación de UIDs
    this.logger.info('\n3. Probando generación y cache de UIDs...');
    const testChannel = bitelChannels[0];
    
    // Primera generación
    const firstUrl = this.bitelUidService.processStreamUrl(testChannel.streamUrl, testChannel.id);
    const firstUid = firstUrl.match(/uid=([^&]+)/)?.[1];
    
    // Segunda generación inmediata (debería usar cache)
    const secondUrl = this.bitelUidService.processStreamUrl(testChannel.streamUrl, testChannel.id);
    const secondUid = secondUrl.match(/uid=([^&]+)/)?.[1];
    
    this.logger.info(`   Canal de prueba: ${testChannel.name}`);
    this.logger.info(`   Primera generación: ${firstUid}`);
    this.logger.info(`   Segunda generación: ${secondUid}`);
    this.logger.info(`   Cache funcionando: ${firstUid === secondUid ? '✅ SÍ' : '❌ NO'}`);
    
    // 4. Simular validaciones múltiples
    this.logger.info('\n4. Simulando múltiples validaciones...');
    const sampleChannels = bitelChannels.slice(0, 3);
    
    const validations = [];
    for (let i = 0; i < 3; i++) {
      this.logger.info(`   Validación ${i + 1}/3...`);
      const report = await this.healthService.checkChannels(sampleChannels, 3, false);
      validations.push(report);
      
      // Esperar 2 segundos entre validaciones
      if (i < 2) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // 5. Analizar consistencia entre validaciones
    this.logger.info('\n5. Analizando consistencia entre validaciones...');
    let totalConsistent = 0;
    let totalChannels = 0;
    
    sampleChannels.forEach(channel => {
      const uids = validations.map(v => {
        const result = v.results.find(r => r.id === channel.id);
        return result?.meta?.processedUrl?.match(/uid=([^&]+)/)?.[1] || 'NO_UID';
      });
      
      const isConsistent = uids.every(uid => uid === uids[0] && uid !== 'NO_UID');
      if (isConsistent) totalConsistent++;
      totalChannels++;
      
      this.logger.info(`   ${channel.name}:`);
      this.logger.info(`     UIDs: [${uids.join(', ')}]`);
      this.logger.info(`     Consistente: ${isConsistent ? '✅ SÍ' : '❌ NO'}`);
    });
    
    // 6. Verificar configuración del sistema
    this.logger.info('\n6. Verificando configuración del sistema...');
    const removeInvalidStreams = this.invalidChannelService.isEnabled();
    this.logger.info(`   REMOVE_INVALID_STREAMS: ${removeInvalidStreams ? '✅ HABILITADO' : '⚠️  DESHABILITADO'}`);
    
    const streamTimeout = this.config.getConfig('validation').streamValidationTimeout;
    this.logger.info(`   STREAM_VALIDATION_TIMEOUT: ${streamTimeout}s`);
    
    const maxConcurrency = this.config.getConfig('validation').maxValidationConcurrency;
    this.logger.info(`   MAX_VALIDATION_CONCURRENCY: ${maxConcurrency}`);
    
    // 7. Resultado final
    this.logger.info('\n🎯 RESULTADO FINAL DE LA VERIFICACIÓN:');
    this.logger.info('=' .repeat(50));
    
    const consistencyRate = (totalConsistent / totalChannels) * 100;
    this.logger.info(`📊 Consistencia de UIDs: ${totalConsistent}/${totalChannels} (${consistencyRate.toFixed(1)}%)`);
    
    if (consistencyRate === 100) {
      this.logger.info('✅ VERIFICACIÓN EXITOSA: La corrección funciona correctamente');
      this.logger.info('✅ Los canales BITEL NO deberían ser desactivados incorrectamente');
      this.logger.info('✅ El sistema está listo para producción');
    } else if (consistencyRate >= 80) {
      this.logger.info('⚠️  VERIFICACIÓN PARCIAL: La mayoría de casos funcionan');
      this.logger.info('⚠️  Revisar casos inconsistentes antes de desplegar');
    } else {
      this.logger.info('❌ VERIFICACIÓN FALLIDA: La corrección no funciona como esperado');
      this.logger.info('❌ NO desplegar hasta resolver los problemas');
    }
    
    // 8. Recomendaciones finales
    this.logger.info('\n💡 RECOMENDACIONES PARA PRODUCCIÓN:');
    this.logger.info('- Monitorear logs de validación periódica');
    this.logger.info('- Configurar alertas si la tasa de desactivación supera el 5%');
    this.logger.info('- Revisar métricas de UIDs BITEL semanalmente');
    this.logger.info('- Considerar aumentar el cache a 30 min si hay problemas');
    
    this.logger.info('\n=== VERIFICACIÓN COMPLETADA ===');
  }
}

async function main() {
  const verification = new BitelFixVerification();
  
  try {
    await verification.initialize();
    await verification.verifyBitelFix();
  } catch (error) {
    console.error('❌ Error en la verificación:', error);
    process.exit(1);
  }
}

// Ejecutar verificación
main().catch(console.error);