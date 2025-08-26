/**
 * Script de diagnóstico para analizar el problema de validación periódica
 * Identifica por qué canales previamente válidos se están desactivando
 */

import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';
import { ChannelRepositoryFactory } from './src/infrastructure/factories/ChannelRepositoryFactory.js';
import { StreamHealthService } from './src/infrastructure/services/StreamHealthService.js';
import { InvalidChannelManagementService } from './src/application/services/InvalidChannelManagementService.js';
import ContentFilterService from './src/domain/services/ContentFilterService.js';

class ValidationDiagnostic {
  constructor() {
    this.config = new TVAddonConfig();
    this.logger = console;
    this.contentFilter = new ContentFilterService(this.config, this.logger);
    this.channelRepository = null;
    this.healthService = null;
    this.invalidChannelService = null;
  }

  async initialize() {
    this.logger.info('🔧 Inicializando servicios de diagnóstico...');
    
    this.channelRepository = await ChannelRepositoryFactory.createRepository(this.config, this.logger);
    
    this.healthService = new StreamHealthService(this.config, this.logger);
    this.invalidChannelService = new InvalidChannelManagementService(
      this.channelRepository,
      this.config,
      this.logger
    );
    
    this.logger.info('✅ Servicios inicializados correctamente');
  }

  async analyzeValidationFlow() {
    this.logger.info('\n🔍 ANÁLISIS DEL FLUJO DE VALIDACIÓN');
    this.logger.info('=' .repeat(50));
    
    // 1. Verificar configuración
    await this.checkConfiguration();
    
    // 2. Analizar estado actual de canales
    await this.analyzeChannelState();
    
    // 3. Simular validación de muestra
    await this.simulateValidation();
    
    // 4. Analizar diferencias en resultados
    await this.analyzeDifferences();
  }

  async checkConfiguration() {
    this.logger.info('\n📋 CONFIGURACIÓN ACTUAL:');
    const validation = this.config.validation;
    
    this.logger.info(`- removeInvalidStreams: ${validation.removeInvalidStreams}`);
    this.logger.info(`- validateStreamsIntervalMinutes: ${validation.validateStreamsIntervalMinutes}`);
    this.logger.info(`- validateAllChannels: ${validation.validateAllChannels}`);
    this.logger.info(`- validationBatchSize: ${validation.validationBatchSize}`);
    this.logger.info(`- maxValidationConcurrency: ${validation.maxValidationConcurrency}`);
    this.logger.info(`- streamValidationTimeout: ${validation.streamValidationTimeout}`);
    
    if (!validation.removeInvalidStreams) {
      this.logger.warn('⚠️  REMOVE_INVALID_STREAMS está deshabilitado - no se desactivarán canales');
    }
  }

  async analyzeChannelState() {
    this.logger.info('\n📊 ESTADO ACTUAL DE CANALES:');
    
    // Obtener canales filtrados y sin filtrar
    const allChannels = await this.channelRepository.getAllChannels();
    const allChannelsUnfiltered = await this.channelRepository.getAllChannelsUnfiltered();
    
    this.logger.info(`- Canales totales (sin filtrar): ${allChannelsUnfiltered.length}`);
    this.logger.info(`- Canales activos (filtrados): ${allChannels.length}`);
    this.logger.info(`- Canales desactivados: ${allChannelsUnfiltered.length - allChannels.length}`);
    
    // Verificar si hay canales desactivados
    if (allChannelsUnfiltered.length > allChannels.length) {
      const deactivatedCount = allChannelsUnfiltered.length - allChannels.length;
      this.logger.warn(`⚠️  Hay ${deactivatedCount} canales desactivados actualmente`);
      
      // Mostrar algunos canales desactivados
      const deactivatedChannels = allChannelsUnfiltered.filter(ch => 
        !allChannels.find(active => active.id === ch.id)
      );
      
      this.logger.info('\n🚫 CANALES DESACTIVADOS (muestra):');
      deactivatedChannels.slice(0, 5).forEach(ch => {
        this.logger.info(`  - ${ch.id}: ${ch.name} (${ch.streamUrl.substring(0, 50)}...)`);
      });
    }
  }

  async simulateValidation() {
    this.logger.info('\n🧪 SIMULANDO VALIDACIÓN PERIÓDICA:');
    
    // Simular exactamente lo que hace el sistema en la validación periódica
    const validation = this.config.validation;
    
    if (validation.validateAllChannels) {
      this.logger.info('- Modo: Validación completa por lotes');
      await this.simulateBatchValidation();
    } else {
      this.logger.info('- Modo: Validación de muestra (30 canales)');
      await this.simulateSampleValidation();
    }
  }

  async simulateBatchValidation() {
    const validation = this.config.validation;
    
    // Usar la misma función que usa el sistema
    const getChannelsFunction = (offset, limit) => 
      this.channelRepository.getChannelsPaginatedUnfiltered ? 
        this.channelRepository.getChannelsPaginatedUnfiltered(offset, limit) :
        this.channelRepository.getChannelsPaginated(offset, limit);
    
    this.logger.info('\n🔄 Ejecutando validación por lotes...');
    const report = await this.healthService.validateAllChannelsBatched(
      getChannelsFunction,
      {
        batchSize: validation.validationBatchSize,
        concurrency: validation.maxValidationConcurrency,
        showProgress: true
      }
    );
    
    this.logger.info('\n📈 RESULTADOS DE VALIDACIÓN:');
    this.logger.info(`- Total procesados: ${report.total}`);
    this.logger.info(`- Válidos: ${report.ok}`);
    this.logger.info(`- Inválidos: ${report.fail}`);
    this.logger.info(`- Tasa de éxito: ${((report.ok / report.total) * 100).toFixed(1)}%`);
    this.logger.info(`- Lotes procesados: ${report.batches}`);
    
    // Analizar resultados específicos
    await this.analyzeValidationResults(report.results);
  }

  async simulateSampleValidation() {
    // Obtener muestra como lo hace el sistema
    const sample = this.channelRepository.getChannelsPaginatedUnfiltered ? 
      await this.channelRepository.getChannelsPaginatedUnfiltered(0, 30) :
      await this.channelRepository.getChannelsPaginated(0, 30);
    
    this.logger.info(`\n🔄 Validando muestra de ${sample.length} canales...`);
    const report = await this.healthService.checkChannels(sample, 10, false);
    
    this.logger.info('\n📈 RESULTADOS DE VALIDACIÓN:');
    this.logger.info(`- Total procesados: ${report.total}`);
    this.logger.info(`- Válidos: ${report.ok}`);
    this.logger.info(`- Inválidos: ${report.fail}`);
    this.logger.info(`- Tasa de éxito: ${((report.ok / report.total) * 100).toFixed(1)}%`);
    
    // Analizar resultados específicos
    await this.analyzeValidationResults(report.results);
  }

  async analyzeValidationResults(results) {
    this.logger.info('\n🔬 ANÁLISIS DETALLADO DE RESULTADOS:');
    
    const validResults = results.filter(r => r.ok);
    const invalidResults = results.filter(r => !r.ok);
    
    this.logger.info(`\n✅ CANALES VÁLIDOS (${validResults.length}):`);
    validResults.slice(0, 3).forEach(result => {
      this.logger.info(`  - ${result.id}: ${result.name} (Status: ${result.meta.status})`);
    });
    
    this.logger.info(`\n❌ CANALES INVÁLIDOS (${invalidResults.length}):`);
    invalidResults.slice(0, 5).forEach(result => {
      this.logger.info(`  - ${result.id}: ${result.name}`);
      this.logger.info(`    Razón: ${result.meta.reason || result.meta.status || 'Desconocida'}`);
    });
    
    // Analizar patrones de fallo
    await this.analyzeFailurePatterns(invalidResults);
  }

  async analyzeFailurePatterns(invalidResults) {
    this.logger.info('\n🔍 PATRONES DE FALLO:');
    
    const failureReasons = {};
    invalidResults.forEach(result => {
      const reason = result.meta.reason || result.meta.status || 'Desconocida';
      failureReasons[reason] = (failureReasons[reason] || 0) + 1;
    });
    
    Object.entries(failureReasons).forEach(([reason, count]) => {
      this.logger.info(`  - ${reason}: ${count} canales`);
    });
    
    // Verificar si hay problemas específicos con BITEL
    const bitelFailures = invalidResults.filter(result => 
      result.name.toLowerCase().includes('bitel') || 
      (result.meta && result.meta.reason === 'HTTP_NOT_OK')
    );
    
    if (bitelFailures.length > 0) {
      this.logger.warn(`\n⚠️  POSIBLES PROBLEMAS CON BITEL: ${bitelFailures.length} canales`);
      bitelFailures.slice(0, 3).forEach(result => {
        this.logger.info(`  - ${result.name}: ${result.meta.reason}`);
      });
    }
  }

  async analyzeDifferences() {
    this.logger.info('\n🔄 ANÁLISIS DE DIFERENCIAS TEMPORALES:');
    
    // Ejecutar dos validaciones con un intervalo pequeño
    this.logger.info('Ejecutando primera validación...');
    const sample1 = await this.channelRepository.getChannelsPaginatedUnfiltered(0, 10);
    const report1 = await this.healthService.checkChannels(sample1, 5, false);
    
    this.logger.info('Esperando 5 segundos...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    this.logger.info('Ejecutando segunda validación...');
    const sample2 = await this.channelRepository.getChannelsPaginatedUnfiltered(0, 10);
    const report2 = await this.healthService.checkChannels(sample2, 5, false);
    
    // Comparar resultados
    this.logger.info('\n📊 COMPARACIÓN DE RESULTADOS:');
    this.logger.info(`Primera validación: ${report1.ok}/${report1.total} válidos`);
    this.logger.info(`Segunda validación: ${report2.ok}/${report2.total} válidos`);
    
    // Buscar inconsistencias
    const inconsistencies = [];
    report1.results.forEach(result1 => {
      const result2 = report2.results.find(r => r.id === result1.id);
      if (result2 && result1.ok !== result2.ok) {
        inconsistencies.push({
          id: result1.id,
          name: result1.name,
          first: result1.ok,
          second: result2.ok,
          firstReason: result1.meta.reason,
          secondReason: result2.meta.reason
        });
      }
    });
    
    if (inconsistencies.length > 0) {
      this.logger.warn(`\n⚠️  INCONSISTENCIAS DETECTADAS: ${inconsistencies.length}`);
      inconsistencies.forEach(inc => {
        this.logger.info(`  - ${inc.name}: ${inc.first} → ${inc.second}`);
        this.logger.info(`    Razones: ${inc.firstReason} → ${inc.secondReason}`);
      });
    } else {
      this.logger.info('✅ No se detectaron inconsistencias entre validaciones');
    }
  }

  async generateRecommendations() {
    this.logger.info('\n💡 RECOMENDACIONES:');
    this.logger.info('=' .repeat(50));
    
    const validation = this.config.validation;
    
    if (validation.streamValidationTimeout < 15) {
      this.logger.info('📈 Considerar aumentar STREAM_VALIDATION_TIMEOUT a 15+ segundos');
    }
    
    if (validation.validateStreamsIntervalMinutes < 30) {
      this.logger.info('⏰ Considerar aumentar VALIDATE_STREAMS_INTERVAL_MINUTES a 30+ minutos');
    }
    
    if (validation.maxValidationConcurrency > 5) {
      this.logger.info('🔄 Considerar reducir MAX_VALIDATION_CONCURRENCY a 5 o menos');
    }
    
    this.logger.info('🔍 Verificar conectividad de red y estabilidad de servidores');
    this.logger.info('📊 Monitorear logs durante validaciones periódicas');
    this.logger.info('🛠️  Considerar implementar retry logic para validaciones fallidas');
  }
}

// Ejecutar diagnóstico
async function main() {
  const diagnostic = new ValidationDiagnostic();
  
  try {
    await diagnostic.initialize();
    await diagnostic.analyzeValidationFlow();
    await diagnostic.generateRecommendations();
    
    console.log('\n✅ Diagnóstico completado');
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
    process.exit(1);
  }
}

// Ejecutar directamente
main().catch(console.error);

export { ValidationDiagnostic };