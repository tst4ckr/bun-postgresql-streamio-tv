#!/usr/bin/env bun

/**
 * @fileoverview Script de diagnóstico para analizar duplicados detectados
 * Identifica la causa raíz de los 410 duplicados reportados
 */

import { TVAddonConfig } from '../src/infrastructure/config/TVAddonConfig.js';
import { CSVChannelRepository } from '../src/infrastructure/repositories/CSVChannelRepository.js';
import { ChannelDeduplicationService, DeduplicationConfig, DeduplicationCriteria } from '../src/domain/services/ChannelDeduplicationService.js';

// Logger simple
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
};

/**
 * Analiza duplicados paso a paso
 */
async function diagnoseDuplicates() {
  try {
    console.log('🔍 DIAGNÓSTICO DE DUPLICADOS DETECTADOS');
    console.log('==========================================');
    
    // Cargar configuración
    const tvConfig = TVAddonConfig.getInstance();
    
    // Cargar canales CSV
    const csvRepository = new CSVChannelRepository(
      tvConfig.dataSources.channelsFile,
      tvConfig,
      logger
    );
    
    const channels = await csvRepository.getAllChannels();
    console.log(`📊 Total de canales cargados: ${channels.length}`);
    
    // Analizar configuración actual
    const config = DeduplicationConfig.fromEnvironment();
    console.log('\n🔧 Configuración de deduplicación:');
    console.log(`   - Criterio: ${config.criteria}`);
    console.log(`   - Estrategia: ${config.strategy}`);
    console.log(`   - Umbral similitud nombres: ${config.nameSimilarityThreshold}`);
    console.log(`   - Umbral similitud URLs: ${config.urlSimilarityThreshold}`);
    console.log(`   - Deduplicación inteligente: ${config.enableIntelligentDeduplication}`);
    console.log(`   - Actualización HD: ${config.enableHdUpgrade}`);
    
    // Crear servicio de deduplicación con logging detallado
    const deduplicationService = new ChannelDeduplicationService(config, logger);
    
    // Analizar duplicados por ID exacto
    console.log('\n🔍 Análisis por ID exacto:');
    const duplicatesByIdMap = new Map();
    const duplicatesByIdCount = new Map();
    
    channels.forEach(channel => {
      const id = channel.id;
      if (duplicatesByIdMap.has(id)) {
        duplicatesByIdMap.get(id).push(channel);
        duplicatesByIdCount.set(id, duplicatesByIdCount.get(id) + 1);
      } else {
        duplicatesByIdMap.set(id, [channel]);
        duplicatesByIdCount.set(id, 1);
      }
    });
    
    const exactDuplicates = Array.from(duplicatesByIdCount.entries())
      .filter(([id, count]) => count > 1)
      .sort((a, b) => b[1] - a[1]);
    
    console.log(`   - IDs duplicados encontrados: ${exactDuplicates.length}`);
    console.log(`   - Total de canales duplicados por ID: ${exactDuplicates.reduce((sum, [id, count]) => sum + (count - 1), 0)}`);
    
    if (exactDuplicates.length > 0) {
      console.log('\n   📋 Top 10 IDs más duplicados:');
      exactDuplicates.slice(0, 10).forEach(([id, count]) => {
        console.log(`      ${id}: ${count} ocurrencias`);
        const duplicateChannels = duplicatesByIdMap.get(id);
        duplicateChannels.forEach((ch, idx) => {
          console.log(`        ${idx + 1}. ${ch.name} (${ch.metadata?.source || 'unknown'})`);
        });
      });
    }
    
    // Analizar similitud de nombres
    console.log('\n🔍 Análisis por similitud de nombres:');
    const nameSimilarityDuplicates = [];
    
    for (let i = 0; i < channels.length; i++) {
      for (let j = i + 1; j < channels.length; j++) {
        const ch1 = channels[i];
        const ch2 = channels[j];
        
        if (ch1.id !== ch2.id) { // Solo si no son duplicados exactos
          const similarity = calculateStringSimilarity(
            normalizeChannelName(ch1.name),
            normalizeChannelName(ch2.name)
          );
          
          if (similarity >= config.nameSimilarityThreshold) {
            nameSimilarityDuplicates.push({
              channel1: ch1,
              channel2: ch2,
              similarity: similarity.toFixed(3)
            });
          }
        }
      }
    }
    
    console.log(`   - Pares similares por nombre: ${nameSimilarityDuplicates.length}`);
    
    if (nameSimilarityDuplicates.length > 0) {
      console.log('\n   📋 Top 10 similitudes de nombres:');
      nameSimilarityDuplicates
        .sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity))
        .slice(0, 10)
        .forEach(({ channel1, channel2, similarity }) => {
          console.log(`      ${similarity}: "${channel1.name}" vs "${channel2.name}"`);
        });
    }
    
    // Ejecutar deduplicación real y comparar
    console.log('\n🔍 Ejecutando deduplicación real:');
    const result = await deduplicationService.deduplicateChannels(channels);
    
    console.log(`   - Canales originales: ${channels.length}`);
    console.log(`   - Canales finales: ${result.channels.length}`);
    console.log(`   - Duplicados encontrados: ${result.metrics.duplicatesFound}`);
    console.log(`   - Duplicados removidos: ${result.metrics.duplicatesRemoved}`);
    console.log(`   - Diferencia real: ${channels.length - result.channels.length}`);
    
    // Verificar discrepancia
    const realDifference = channels.length - result.channels.length;
    if (realDifference !== result.metrics.duplicatesRemoved) {
      console.log('\n⚠️  DISCREPANCIA DETECTADA:');
      console.log(`   - Duplicados reportados: ${result.metrics.duplicatesRemoved}`);
      console.log(`   - Diferencia real: ${realDifference}`);
      console.log(`   - Error en conteo: ${result.metrics.duplicatesRemoved - realDifference}`);
    }
    
    // Análisis de fuentes
    console.log('\n📊 Análisis por fuentes:');
    const sourceStats = new Map();
    channels.forEach(ch => {
      const source = ch.metadata?.source || 'unknown';
      sourceStats.set(source, (sourceStats.get(source) || 0) + 1);
    });
    
    Array.from(sourceStats.entries()).forEach(([source, count]) => {
      console.log(`   - ${source}: ${count} canales`);
    });
    
    console.log('\n✅ Diagnóstico completado');
    
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
    process.exit(1);
  }
}

/**
 * Normaliza nombre de canal para comparación
 */
function normalizeChannelName(name) {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calcula similitud entre dos strings usando distancia de Levenshtein
 */
function calculateStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;
  
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  
  return maxLength === 0 ? 1 : (maxLength - distance) / maxLength;
}

/**
 * Calcula distancia de Levenshtein entre dos strings
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Ejecutar diagnóstico
if (import.meta.main) {
  diagnoseDuplicates();
}