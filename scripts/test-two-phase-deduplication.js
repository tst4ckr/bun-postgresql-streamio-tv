#!/usr/bin/env bun

import { ChannelDeduplicationService, DeduplicationConfig, DeduplicationCriteria, ConflictResolutionStrategy } from '../src/domain/services/ChannelDeduplicationService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import { StreamQuality } from '../src/domain/value-objects/StreamQuality.js';

/**
 * Script para probar la estrategia de deduplicación en dos fases:
 * 1. URLs idénticas (prioridad máxima)
 * 2. Nombres normalizados (segunda prioridad)
 */
async function testTwoPhaseDedupliation() {
  console.log('=== TEST: Estrategia de Deduplicación en Dos Fases ===\n');

  // Configuración con umbrales según especificación del usuario
  const config = new DeduplicationConfig({
    criteria: DeduplicationCriteria.COMBINED,
    strategy: ConflictResolutionStrategy.PRIORITIZE_HD,
    nameSimilarityThreshold: 0.85,
    urlSimilarityThreshold: 0.90,
    enableHdUpgrade: true,
    enableMetrics: true
  });

  const service = new ChannelDeduplicationService(config);

  // Canales de prueba que demuestran la estrategia de dos fases
  const channels = [
    // CASO 1: URLs idénticas pero nombres diferentes (deben ser duplicados por URL)
    new Channel({
      id: 'tv_fox_sports_1',
      name: 'Fox Sports',
      streamUrl: 'http://stream.example.com/fox-sports',
      quality: new StreamQuality('HD')
    }),
    new Channel({
      id: 'tv_fox_sports_2',
      name: 'Fox Sports HD',
      streamUrl: 'http://stream.example.com/fox-sports', // URL idéntica
      quality: new StreamQuality('HD')
    }),

    // CASO 2: URLs diferentes pero nombres similares después de normalización
    new Channel({
      id: 'tv_cnn_1',
      name: '38-CNN',
      streamUrl: 'http://stream1.example.com/cnn',
      quality: new StreamQuality('SD')
    }),
    new Channel({
      id: 'tv_cnn_2',
      name: 'CNN HD',
      streamUrl: 'http://stream2.example.com/cnn-hd', // URL diferente
      quality: new StreamQuality('HD')
    }),

    // CASO 3: Fox Sports con números (deben mantenerse separados)
    new Channel({
      id: 'tv_fox_sports2_1',
      name: 'Fox Sports 2',
      streamUrl: 'http://stream.example.com/fox-sports-2',
      quality: new StreamQuality('SD')
    }),
    new Channel({
      id: 'tv_fox_sports2_2',
      name: '105-Fox Sports 2',
      streamUrl: 'http://stream.example.com/fox-sports-2-alt', // URL diferente
      quality: new StreamQuality('HD')
    }),
    new Channel({
      id: 'tv_fox_sports3_1',
      name: 'Fox Sports 3',
      streamUrl: 'http://stream.example.com/fox-sports-3',
      quality: new StreamQuality('HD')
    }),

    // CASO 4: URLs idénticas con diferentes calidades
    new Channel({
      id: 'tv_discovery_1',
      name: 'Discovery Channel',
      streamUrl: 'http://stream.example.com/discovery',
      quality: new StreamQuality('SD')
    }),
    new Channel({
      id: 'tv_discovery_2',
      name: 'Discovery Channel 4K',
      streamUrl: 'http://stream.example.com/discovery', // URL idéntica
      quality: new StreamQuality('4K')
    })
  ];

  console.log('Canales originales:');
  channels.forEach((channel, index) => {
    console.log(`${index + 1}. ${channel.name} (${channel.quality.value}) - URL: ${channel.streamUrl}`);
  });
  console.log(`\nTotal: ${channels.length} canales\n`);

  // Ejecutar deduplicación
  const result = await service.deduplicateChannels(channels);
  const { channels: deduplicatedChannels, metrics } = result;

  console.log('=== Resultados de Deduplicación ===');
  console.log(`Canales únicos: ${deduplicatedChannels.length}`);
  console.log(`Duplicados removidos: ${metrics.duplicatesRemoved}`);
  console.log(`Tiempo de procesamiento: ${metrics.processingTimeMs}ms\n`);

  console.log('Canales finales:');
  deduplicatedChannels.forEach((channel, index) => {
    console.log(`${index + 1}. ${channel.name} (${channel.quality.value}) - URL: ${channel.streamUrl}`);
  });

  console.log('\n=== Análisis de Casos ===');
  
  // Verificar CASO 1: URLs idénticas
  const foxSportsChannels = deduplicatedChannels.filter(ch => 
    ch.streamUrl === 'http://stream.example.com/fox-sports'
  );
  console.log(`\nCASO 1 - URLs idénticas Fox Sports: ${foxSportsChannels.length} canal(es)`);
  if (foxSportsChannels.length === 1) {
    console.log(`✅ Correcto: Se mantuvo "${foxSportsChannels[0].name}" (${foxSportsChannels[0].quality.value})`);
  } else {
    console.log(`❌ Error: Debería haber solo 1 canal Fox Sports`);
  }

  // Verificar CASO 2: Nombres similares, URLs diferentes
  const cnnChannels = deduplicatedChannels.filter(ch => 
    ch.name.toLowerCase().includes('cnn')
  );
  console.log(`\nCASO 2 - CNN con URLs diferentes: ${cnnChannels.length} canal(es)`);
  if (cnnChannels.length === 1) {
    console.log(`✅ Correcto: Se mantuvo "${cnnChannels[0].name}" (${cnnChannels[0].quality.value})`);
  } else {
    console.log(`❌ Error: Debería haber solo 1 canal CNN`);
  }

  // Verificar CASO 3: Fox Sports con números
  const foxSports2Channels = deduplicatedChannels.filter(ch => 
    ch.name.toLowerCase().includes('fox sports 2')
  );
  const foxSports3Channels = deduplicatedChannels.filter(ch => 
    ch.name.toLowerCase().includes('fox sports 3')
  );
  console.log(`\nCASO 3 - Fox Sports numerados:`);
  console.log(`  Fox Sports 2: ${foxSports2Channels.length} canal(es)`);
  console.log(`  Fox Sports 3: ${foxSports3Channels.length} canal(es)`);
  
  if (foxSports2Channels.length === 1 && foxSports3Channels.length === 1) {
    console.log(`✅ Correcto: Fox Sports 2 y 3 se mantienen separados`);
  } else {
    console.log(`❌ Error: Fox Sports 2 y 3 deberían mantenerse separados`);
  }

  // Verificar CASO 4: URLs idénticas con diferentes calidades
  const discoveryChannels = deduplicatedChannels.filter(ch => 
    ch.streamUrl === 'http://stream.example.com/discovery'
  );
  console.log(`\nCASO 4 - Discovery URLs idénticas: ${discoveryChannels.length} canal(es)`);
  if (discoveryChannels.length === 1) {
    const discoveryChannel = discoveryChannels[0];
    if (discoveryChannel.quality.value === '4K') {
      console.log(`✅ Correcto: Se mantuvo la versión 4K "${discoveryChannel.name}"`);
    } else {
      console.log(`❌ Error: Debería haberse mantenido la versión 4K`);
    }
  } else {
    console.log(`❌ Error: Debería haber solo 1 canal Discovery`);
  }

  console.log('\n=== Métricas Detalladas ===');
  console.log(`Duplicados por fuente:`, metrics.duplicatesBySource);
  console.log(`Duplicados por criterio:`, metrics.duplicatesByCriteria);
  console.log(`Duplicados por estrategia:`, metrics.duplicatesByStrategy);
  console.log(`Actualizaciones HD:`, metrics.hdUpgrades);
}

// Ejecutar el test
testTwoPhaseDedupliation().catch(console.error);