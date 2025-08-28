import { ChannelDeduplicationService } from '../src/domain/services/ChannelDeduplicationService.js';

/**
 * Replica la lógica de normalización actual para debuggear
 */
function normalizeChannelName(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  
  let normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
    .replace(/\s+/g, ' ')        // Normalizar espacios
    .trim();
  
  // Remover prefijos numéricos comunes (ej: "105-CNN" -> "CNN")
  normalized = normalized.replace(/^\d+\s*-?\s*/, '');
  
  // Remover sufijos de calidad comunes
  normalized = normalized
    .replace(/\s+(hd|sd|fhd|uhd|4k)$/g, '')
    .replace(/\s+\d+hd$/g, '') // Remover variantes como "6hd"
    .replace(/_hd$/g, '');     // Remover "_hd"
  
  // Normalizar números romanos a arábigos para mejor comparación
  const romanToArabic = {
    'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
    'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10'
  };
  
  // Reemplazar números romanos al final del nombre
  normalized = normalized.replace(/\s+(i{1,3}|iv|v|vi{1,3}|ix|x)$/g, (match, roman) => {
    return ' ' + (romanToArabic[roman] || roman);
  });
  
  // Normalizar variaciones de "canal" (ej: "canal 1", "canal uno" -> "canal 1")
  const numberWords = {
    'uno': '1', 'dos': '2', 'tres': '3', 'cuatro': '4', 'cinco': '5',
    'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9', 'diez': '10',
    'once': '11', 'doce': '12', 'trece': '13', 'catorce': '14', 'quince': '15'
  };
  
  Object.entries(numberWords).forEach(([word, number]) => {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    normalized = normalized.replace(regex, number);
  });
  
  return normalized.trim();
}

/**
 * Script para debuggear la normalización de canales Fox
 */
function debugFoxNormalization() {
  console.log('=== DEBUG: Normalización de Canales Fox ===\n');
  
  // Canales Fox de ejemplo
  const foxChannels = [
    'Food Network HD',
    'Fox Sports 2',
    'Fox Sports 2 HD', 
    'Fox Sports 3',
    'Fox Sports 3 HD',
    'Fox Sports HD',
    '105-Fox Sports 2',
    '22-Fox Sports 3 HD'
  ];
  
  console.log('Canales originales:');
  foxChannels.forEach((channel, index) => {
    console.log(`${index + 1}. ${channel}`);
  });
  
  console.log('\n=== Normalización Actual ===');
  foxChannels.forEach((channel, index) => {
    const normalized = normalizeChannelName(channel);
    console.log(`${index + 1}. "${channel}" -> "${normalized}"`);
  });
  
  console.log('\n=== Análisis del Problema ===');
  const uniqueNormalized = new Set();
  const duplicateGroups = new Map();
  
  foxChannels.forEach(channel => {
    const normalized = normalizeChannelName(channel);
    
    if (!duplicateGroups.has(normalized)) {
      duplicateGroups.set(normalized, []);
    }
    duplicateGroups.get(normalized).push(channel);
    uniqueNormalized.add(normalized);
  });
  
  console.log(`Canales únicos después de normalización: ${uniqueNormalized.size}`);
  console.log('\nGrupos de duplicados:');
  
  duplicateGroups.forEach((channels, normalized) => {
    if (channels.length > 1) {
      console.log(`\n"${normalized}" agrupa:`);
      channels.forEach(channel => {
        console.log(`  - ${channel}`);
      });
    }
  });
  
  console.log('\n=== Problema Identificado ===');
  console.log('La normalización está removiendo números importantes del nombre del canal.');
  console.log('"Fox Sports 2" y "Fox Sports 3" se normalizan a "fox sports", perdiendo el identificador numérico.');
  console.log('\nSolución necesaria: Preservar números que son parte del nombre del canal, no solo prefijos.');
}

// Ejecutar el debug
try {
  debugFoxNormalization();
} catch (error) {
  console.error('Error durante el debug:', error.message);
  console.error(error.stack);
}