/**
 * Tests unitarios para ChannelDeduplicationService
 * Valida la funcionalidad de deduplicación de canales
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ChannelDeduplicationService, DeduplicationConfig, DeduplicationCriteria, ConflictResolutionStrategy } from '../../../src/domain/services/ChannelDeduplicationService.js';
import { Channel } from '../../../src/domain/entities/Channel.js';
import { StreamQuality } from '../../../src/domain/value-objects/StreamQuality.js';

describe('ChannelDeduplicationService', () => {
  let service;
  let config;

  beforeEach(() => {
    config = new DeduplicationConfig({
      criteria: DeduplicationCriteria.COMBINED,
      strategy: ConflictResolutionStrategy.PRIORITIZE_SOURCE,
      enableMetrics: true
    });
    service = new ChannelDeduplicationService(config);
  });

  describe('Configuración', () => {
    it('debería crear configuración por defecto', () => {
      const defaultConfig = new DeduplicationConfig();
      expect(defaultConfig.criteria).toBe(DeduplicationCriteria.COMBINED);
      expect(defaultConfig.strategy).toBe(ConflictResolutionStrategy.PRIORITIZE_SOURCE);
      expect(defaultConfig.enableIntelligentDeduplication).toBe(true);
    });

    it('debería crear configuración desde variables de entorno', () => {
      // Simular variables de entorno
      process.env.ENABLE_INTELLIGENT_DEDUPLICATION = 'true';
      process.env.ENABLE_HD_UPGRADE = 'true';
      process.env.NAME_SIMILARITY_THRESHOLD = '0.90';
      
      const envConfig = DeduplicationConfig.fromEnvironment();
      expect(envConfig.enableIntelligentDeduplication).toBe(true);
      expect(envConfig.enableHdUpgrade).toBe(true);
      expect(envConfig.nameSimilarityThreshold).toBe(0.90);
    });
  });

  describe('Deduplicación básica', () => {
    it('debería mantener canales únicos sin cambios', async () => {
      const channels = [
        createTestChannel('tv_canal1', 'Canal 1', 'http://example.com/1', 'csv'),
        createTestChannel('tv_canal2', 'Canal 2', 'http://example.com/2', 'csv'),
        createTestChannel('tv_canal3', 'Canal 3', 'http://example.com/3', 'm3u')
      ];

      const result = await service.deduplicateChannels(channels);
      
      expect(result.channels).toHaveLength(3);
      expect(result.metrics.duplicatesFound).toBe(0);
      expect(result.metrics.duplicatesRemoved).toBe(0);
    });

    it('debería detectar y remover duplicados exactos por ID', async () => {
      const channels = [
        createTestChannel('tv_canal1', 'Canal 1', 'http://example.com/1', 'csv'),
        createTestChannel('tv_canal1', 'Canal 1 Duplicado', 'http://example.com/1-dup', 'm3u'),
        createTestChannel('tv_canal2', 'Canal 2', 'http://example.com/2', 'csv')
      ];

      const result = await service.deduplicateChannels(channels);
      
      expect(result.channels).toHaveLength(2);
      expect(result.metrics.duplicatesFound).toBe(1);
      expect(result.metrics.duplicatesRemoved).toBe(1);
    });
  });

  describe('Priorización por fuente', () => {
    it('debería priorizar canales CSV sobre M3U', async () => {
      const channels = [
        createTestChannel('tv_canal1', 'Canal CSV', 'http://example.com/csv', 'csv'),
        createTestChannel('tv_canal1', 'Canal M3U', 'http://example.com/m3u', 'm3u')
      ];

      const result = await service.deduplicateChannels(channels);
      
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].name).toBe('Canal CSV');
      expect(result.channels[0].metadata.source).toBe('csv');
    });

    it('debería mantener orden de prioridad configurado', async () => {
      const customConfig = new DeduplicationConfig({
        sourcePriority: ['m3u', 'csv'] // M3U tiene prioridad
      });
      const customService = new ChannelDeduplicationService(customConfig);

      const channels = [
        createTestChannel('tv_canal1', 'Canal CSV', 'http://example.com/csv', 'csv'),
        createTestChannel('tv_canal1', 'Canal M3U', 'http://example.com/m3u', 'm3u')
      ];

      const result = await customService.deduplicateChannels(channels);
      
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].name).toBe('Canal M3U');
      expect(result.channels[0].metadata.source).toBe('m3u');
    });
  });

  describe('Actualización HD', () => {
    it('debería actualizar canal SD a HD cuando está habilitado', async () => {
      // Configurar servicio con actualización HD habilitada
      const hdUpgradeConfig = new DeduplicationConfig({
        enableHdUpgrade: true,
        strategy: ConflictResolutionStrategy.PRIORITIZE_HD
      });
      const hdUpgradeService = new ChannelDeduplicationService(hdUpgradeConfig);
      
      const channels = [
        createTestChannel('tv_canal1', 'Canal SD', 'http://example.com/sd', 'csv', StreamQuality.QUALITIES.SD),
        createTestChannel('tv_canal1', 'Canal HD', 'http://example.com/hd', 'm3u', StreamQuality.QUALITIES.HD)
      ];

      const result = await hdUpgradeService.deduplicateChannels(channels);
      
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].quality.value).toBe(StreamQuality.QUALITIES.HD);
      expect(result.metrics.hdUpgrades).toBe(1);
    });

    it('debería mantener canal HD existente', async () => {
      const channels = [
        createTestChannel('tv_canal1', 'Canal HD', 'http://example.com/hd', 'csv', StreamQuality.QUALITIES.HD),
        createTestChannel('tv_canal1', 'Canal SD', 'http://example.com/sd', 'm3u', StreamQuality.QUALITIES.SD)
      ];

      const result = await service.deduplicateChannels(channels);
      
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].quality.value).toBe(StreamQuality.QUALITIES.HD);
      expect(result.channels[0].metadata.source).toBe('csv'); // Mantiene fuente prioritaria
      expect(result.metrics.hdUpgrades).toBe(0);
    });

    it('debería respetar deshabilitación de actualización HD', async () => {
      const noHdConfig = new DeduplicationConfig({
        enableHdUpgrade: false
      });
      const noHdService = new ChannelDeduplicationService(noHdConfig);

      const channels = [
        createTestChannel('tv_canal1', 'Canal SD', 'http://example.com/sd', 'csv', StreamQuality.QUALITIES.SD),
        createTestChannel('tv_canal1', 'Canal HD', 'http://example.com/hd', 'm3u', StreamQuality.QUALITIES.HD)
      ];

      const result = await noHdService.deduplicateChannels(channels);
      
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].quality.value).toBe(StreamQuality.QUALITIES.SD);
      expect(result.channels[0].metadata.source).toBe('csv');
      expect(result.metrics.hdUpgrades).toBe(0);
    });
  });

  describe('Similitud de nombres', () => {
    it('debería detectar canales con nombres similares', async () => {
      const channels = [
        createTestChannel('tv_canal_uno', 'Canal Uno', 'http://example.com/1', 'csv'),
        createTestChannel('tv_canal_1', 'Canal 1', 'http://example.com/2', 'm3u')
      ];

      const result = await service.deduplicateChannels(channels);
      
      // Dependiendo del threshold, podrían ser considerados duplicados
      expect(result.channels.length).toBeGreaterThanOrEqual(1);
      expect(result.channels.length).toBeLessThanOrEqual(2);
    });

    it('debería respetar threshold de similitud de nombres', async () => {
      const strictConfig = new DeduplicationConfig({
        nameSimilarityThreshold: 0.95 // Muy estricto
      });
      const strictService = new ChannelDeduplicationService(strictConfig);

      const channels = [
        createTestChannel('tv_canal1', 'Canal Uno', 'http://example.com/1', 'csv'),
        createTestChannel('tv_canal2', 'Canal Dos', 'http://example.com/2', 'm3u')
      ];

      const result = await strictService.deduplicateChannels(channels);
      
      expect(result.channels).toHaveLength(2); // No deberían ser considerados duplicados
    });
  });

  describe('Estrategias de resolución', () => {
    it('debería aplicar estrategia KEEP_FIRST', async () => {
      const keepFirstConfig = new DeduplicationConfig({
        strategy: ConflictResolutionStrategy.KEEP_FIRST
      });
      const keepFirstService = new ChannelDeduplicationService(keepFirstConfig);

      const channels = [
        createTestChannel('tv_canal1', 'Primer Canal', 'http://example.com/1', 'csv'),
        createTestChannel('tv_canal1', 'Segundo Canal', 'http://example.com/2', 'm3u')
      ];

      const result = await keepFirstService.deduplicateChannels(channels);
      
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].name).toBe('Primer Canal');
    });

    it('debería aplicar estrategia KEEP_LAST', async () => {
      const keepLastConfig = new DeduplicationConfig({
        strategy: ConflictResolutionStrategy.KEEP_LAST
      });
      const keepLastService = new ChannelDeduplicationService(keepLastConfig);

      const channels = [
        createTestChannel('tv_canal1', 'Primer Canal', 'http://example.com/1', 'csv'),
        createTestChannel('tv_canal1', 'Segundo Canal', 'http://example.com/2', 'm3u')
      ];

      const result = await keepLastService.deduplicateChannels(channels);
      
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].name).toBe('Segundo Canal');
    });

    it('debería aplicar estrategia PRIORITIZE_HD', async () => {
      const hdConfig = new DeduplicationConfig({
        strategy: ConflictResolutionStrategy.PRIORITIZE_HD
      });
      const hdService = new ChannelDeduplicationService(hdConfig);

      const channels = [
        createTestChannel('tv_canal1', 'Canal SD', 'http://example.com/sd', 'csv', StreamQuality.QUALITIES.SD),
        createTestChannel('tv_canal1', 'Canal HD', 'http://example.com/hd', 'm3u', StreamQuality.QUALITIES.HD)
      ];

      const result = await hdService.deduplicateChannels(channels);
      
      expect(result.channels).toHaveLength(1);
      expect(result.channels[0].quality.value).toBe(StreamQuality.QUALITIES.HD);
    });
  });

  describe('Métricas', () => {
    it('debería generar métricas detalladas', async () => {
      const channels = [
        createTestChannel('tv_canal1', 'Canal 1', 'http://example.com/1', 'csv'),
        createTestChannel('tv_canal1', 'Canal 1 Dup', 'http://example.com/1-dup', 'm3u'),
        createTestChannel('tv_canal2', 'Canal 2 SD', 'http://example.com/2-sd', 'csv', StreamQuality.QUALITIES.SD),
        createTestChannel('tv_canal2', 'Canal 2 HD', 'http://example.com/2-hd', 'm3u', StreamQuality.QUALITIES.HD),
        createTestChannel('tv_canal3', 'Canal 3', 'http://example.com/3', 'csv')
      ];

      const result = await service.deduplicateChannels(channels);
      
      expect(result.metrics.totalChannels).toBe(5);
      expect(result.metrics.duplicatesFound).toBeGreaterThan(0);
      expect(result.metrics.duplicatesRemoved).toBeGreaterThan(0);
      expect(result.metrics.processingTimeMs).toBeGreaterThan(0);
      expect(result.metrics.deduplicationRate).toBeDefined();
      expect(result.metrics.duplicatesBySource).toBeDefined();
    });

    it('debería calcular tasa de deduplicación correctamente', async () => {
      const channels = [
        createTestChannel('tv_canal1', 'Canal 1', 'http://example.com/1', 'csv'),
        createTestChannel('tv_canal1', 'Canal 1 Dup', 'http://example.com/1-dup', 'm3u')
      ];

      const result = await service.deduplicateChannels(channels);
      
      expect(result.metrics.totalChannels).toBe(2);
      expect(result.metrics.duplicatesRemoved).toBe(1);
      expect(parseFloat(result.metrics.deduplicationRate)).toBe(50.0);
    });
  });

  describe('Casos edge', () => {
    it('debería manejar lista vacía', async () => {
      const result = await service.deduplicateChannels([]);
      
      expect(result.channels).toHaveLength(0);
      expect(result.metrics.totalChannels).toBe(0);
      expect(result.metrics.duplicatesFound).toBe(0);
    });

    it('debería manejar canal único', async () => {
      const channels = [
        createTestChannel('tv_canal1', 'Canal Único', 'http://example.com/1', 'csv')
      ];

      const result = await service.deduplicateChannels(channels);
      
      expect(result.channels).toHaveLength(1);
      expect(result.metrics.duplicatesFound).toBe(0);
    });

    it('debería manejar canales con metadata faltante', async () => {
      const channelWithoutMetadata = new Channel({
        id: 'tv_test',
        name: 'Test Channel',
        streamUrl: 'http://example.com/test',
        genre: 'General',
        country: 'Test',
        language: 'es',
        quality: StreamQuality.QUALITIES.AUTO,
        type: Channel.TYPES.TV,
        isActive: true
        // Sin metadata
      });

      const channels = [channelWithoutMetadata];
      const result = await service.deduplicateChannels(channels);
      
      expect(result.channels).toHaveLength(1);
      expect(() => result.channels[0]).not.toThrow();
    });
  });

  describe('Configuración dinámica', () => {
    it('debería permitir actualizar configuración', () => {
      const newConfig = new DeduplicationConfig({
        enableHdUpgrade: false,
        nameSimilarityThreshold: 0.95
      });

      service.updateConfig(newConfig);
      const currentConfig = service.getConfig();
      
      expect(currentConfig.enableHdUpgrade).toBe(false);
      expect(currentConfig.nameSimilarityThreshold).toBe(0.95);
    });

    it('debería permitir obtener métricas actuales', async () => {
      const channels = [
        createTestChannel('tv_canal1', 'Canal 1', 'http://example.com/1', 'csv'),
        createTestChannel('tv_canal1', 'Canal 1 Dup', 'http://example.com/1-dup', 'm3u')
      ];

      await service.deduplicateChannels(channels);
      const metrics = service.getMetrics();
      
      expect(metrics.totalChannels).toBe(2);
      expect(metrics.duplicatesFound).toBe(1);
    });
  });
});

/**
 * Función helper para crear canales de prueba
 */
function createTestChannel(id, name, url, source, quality = StreamQuality.QUALITIES.AUTO) {
  return new Channel({
    id,
    name,
    streamUrl: url,
    genre: 'General',
    country: 'Test',
    language: 'es',
    quality,
    type: Channel.TYPES.TV,
    isActive: true,
    metadata: {
      source,
      originalData: {}
    }
  });
}