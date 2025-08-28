#!/usr/bin/env bun

import { ChannelDeduplicationService, DeduplicationConfig, DeduplicationCriteria } from '../src/domain/services/ChannelDeduplicationService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import { StreamQuality } from '../src/domain/value-objects/StreamQuality.js';

/**
 * Script para probar el algoritmo de deduplicación mejorado con las listas M3U reales
 */
class RealM3UDeduplicationTest {
  constructor() {
    this.logger = {
      info: (msg) => console.log(`ℹ️  ${msg}`),
      warn: (msg) => console.log(`⚠️  ${msg}`),
      error: (msg) => console.log(`❌ ${msg}`),
      debug: (msg) => console.log(`🔍 ${msg}`)
    };

    this.m3uUrls = [
      'http://45.175.139.194:8000/playlist.m3u',
      'http://190.60.42.86:8000/playlist.m3u', 
      'http://190.123.90.146:8000/playlist.m3u',
      'http://181.188.216.5:18000/playlist.m3u'
    ];
  }

  /**
   * Parsea una línea EXTINF para extraer el nombre del canal
   */
  parseExtinf(line) {
    // Formato: #EXTINF:-1,NOMBRE_CANAL
    const match = line.match(/#EXTINF:[^,]*,(.+)$/);
    return match ? match[1].trim() : null;
  }

  /**
   * Obtiene canales de una URL M3U
   */
  async fetchChannelsFromM3U(url, sourceIndex) {
    try {
      this.logger.info(`Obteniendo canales de: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const content = await response.text();
      const lines = content.split('\n');
      const channels = [];
      
      let currentChannelName = null;
      let channelId = 1;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('#EXTINF:')) {
          currentChannelName = this.parseExtinf(trimmedLine);
        } else if (trimmedLine.startsWith('http') && currentChannelName) {
          // Crear objeto Channel
          const channel = new Channel({
            id: `tv_${sourceIndex}_${channelId}`,
            name: currentChannelName,
            streamUrl: trimmedLine,
            quality: StreamQuality.QUALITIES.SD,
            metadata: {
              source: `Lista${sourceIndex}`,
              originalName: currentChannelName
            }
          });
          
          channels.push(channel);
          channelId++;
          currentChannelName = null;
        }
      }
      
      this.logger.info(`✅ ${channels.length} canales obtenidos de Lista${sourceIndex}`);
      return channels;
      
    } catch (error) {
      this.logger.error(`Error obteniendo canales de ${url}: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtiene todos los canales de todas las listas M3U
   */
  async fetchAllChannels() {
    const allChannels = [];
    
    for (let i = 0; i < this.m3uUrls.length; i++) {
      const channels = await this.fetchChannelsFromM3U(this.m3uUrls[i], i + 1);
      allChannels.push(...channels);
    }
    
    return allChannels;
  }

  /**
   * Prueba la configuración antigua (umbral 95%)
   */
  async testOldConfiguration(channels) {
    this.logger.info('\n🔧 === CONFIGURACIÓN ANTIGUA (Umbral 95%) ===');
    
    const config = new DeduplicationConfig({
      criteria: DeduplicationCriteria.NAME_SIMILARITY,
      nameSimilarityThreshold: 0.95,
      enableMetrics: true
    });
    
    const service = new ChannelDeduplicationService(config, this.logger);
    const result = await service.deduplicateChannels(channels);
    
    this.logger.info(`📊 Resultados configuración antigua:`);
    this.logger.info(`   Canales originales: ${channels.length}`);
    this.logger.info(`   Canales únicos: ${result.channels.length}`);
    this.logger.info(`   Duplicados removidos: ${result.metrics.duplicatesRemoved}`);
    const deduplicationRate = ((result.metrics.duplicatesRemoved / channels.length) * 100);
    this.logger.info(`   Tasa de deduplicación: ${deduplicationRate.toFixed(2)}%`);
    
    return result;
  }

  /**
   * Prueba la configuración mejorada (umbral 85%)
   */
  async testImprovedConfiguration(channels) {
    this.logger.info('\n🚀 === CONFIGURACIÓN MEJORADA (Umbral 85%) ===');
    
    const config = new DeduplicationConfig({
      criteria: DeduplicationCriteria.NAME_SIMILARITY,
      nameSimilarityThreshold: 0.85,
      enableMetrics: true
    });
    
    const service = new ChannelDeduplicationService(config, this.logger);
    const result = await service.deduplicateChannels(channels);
    
    this.logger.info(`📊 Resultados configuración mejorada:`);
    this.logger.info(`   Canales originales: ${channels.length}`);
    this.logger.info(`   Canales únicos: ${result.channels.length}`);
    this.logger.info(`   Duplicados removidos: ${result.metrics.duplicatesRemoved}`);
    const deduplicationRate = ((result.metrics.duplicatesRemoved / channels.length) * 100);
    this.logger.info(`   Tasa de deduplicación: ${deduplicationRate.toFixed(2)}%`);
    
    return result;
  }

  /**
   * Analiza ejemplos específicos de duplicados detectados
   */
  analyzeSpecificDuplicates(oldResult, newResult, originalChannels) {
    this.logger.info('\n🔍 === ANÁLISIS DE MEJORAS ===');
    
    const oldUniqueCount = oldResult.channels.length;
    const newUniqueCount = newResult.channels.length;
    const improvement = oldUniqueCount - newUniqueCount;
    
    this.logger.info(`📈 Mejora en detección de duplicados: ${improvement} canales adicionales detectados`);
    
    if (improvement > 0) {
      this.logger.info(`✅ El algoritmo mejorado detectó ${improvement} duplicados adicionales`);
      
      // Mostrar algunos ejemplos de canales que fueron detectados como duplicados en la nueva configuración
      const oldChannelNames = new Set(oldResult.channels.map(c => c.name));
      const newChannelNames = new Set(newResult.channels.map(c => c.name));
      
      const additionallyRemoved = [...oldChannelNames].filter(name => !newChannelNames.has(name));
      
      if (additionallyRemoved.length > 0) {
        this.logger.info(`🔍 Ejemplos de canales detectados como duplicados adicionales:`);
        additionallyRemoved.slice(0, 10).forEach(name => {
          this.logger.info(`   - ${name}`);
        });
      }
    } else if (improvement === 0) {
      this.logger.info(`ℹ️  Ambas configuraciones produjeron el mismo resultado`);
    } else {
      this.logger.warn(`⚠️  La configuración antigua detectó más duplicados (diferencia: ${Math.abs(improvement)})`);
    }
  }

  /**
   * Ejecuta todas las pruebas
   */
  async runAllTests() {
    try {
      this.logger.info('🎯 === PRUEBA DE DEDUPLICACIÓN CON LISTAS M3U REALES ===\n');
      
      // Obtener todos los canales
      this.logger.info('📡 Obteniendo canales de todas las listas M3U...');
      const allChannels = await this.fetchAllChannels();
      
      if (allChannels.length === 0) {
        this.logger.error('❌ No se pudieron obtener canales de ninguna lista M3U');
        return;
      }
      
      this.logger.info(`📊 Total de canales obtenidos: ${allChannels.length}`);
      
      // Probar configuración antigua
      const oldResult = await this.testOldConfiguration(allChannels);
      
      // Probar configuración mejorada
      const newResult = await this.testImprovedConfiguration(allChannels);
      
      // Analizar mejoras
      this.analyzeSpecificDuplicates(oldResult, newResult, allChannels);
      
      this.logger.info('\n✅ Pruebas completadas exitosamente');
      
    } catch (error) {
      this.logger.error(`❌ Error durante las pruebas: ${error.message}`);
      console.error(error);
    }
  }
}

// Ejecutar las pruebas
const tester = new RealM3UDeduplicationTest();
tester.runAllTests();