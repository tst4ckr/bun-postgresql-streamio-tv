import { ChannelDeduplicationService, DeduplicationConfig, DeduplicationCriteria, ConflictResolutionStrategy } from '../src/domain/services/ChannelDeduplicationService.js';
import { Channel } from '../src/domain/entities/Channel.js';
import { StreamQuality } from '../src/domain/value-objects/StreamQuality.js';

/**
 * Debug específico para detección de calidad
 */

function testQualityDetection() {
  console.log('=== DEBUG DETECCIÓN DE CALIDAD ===\n');
  
  const testNames = [
    'DISCOVERY KIDS',
    'DISCOVERY KIDS HD',
    'CARACOL TV',
    'CARACOL TV HD',
    'CARACOL TV SD_IN',
    'ESPN 1',
    'ESPN 1 HD',
    'CANAL TEST 4K',
    'CANAL TEST UHD',
    'CANAL TEST FHD'
  ];
  
  console.log('Probando patrones de detección de calidad manualmente:');
  console.log();
  
  testNames.forEach(name => {
    console.log(`Canal: "${name}"`);
    
    const lowerName = name.toLowerCase();
    
    // Patrones de alta calidad (copiados del código fuente)
    const highQualityPatterns = [
      /_hd\b/,           // _hd
      /\bhd\b/,          // hd como palabra completa
      /\b\d+hd\b/,       // variantes numéricas (4hd, 6hd, etc.)
      /\buhd\b/,         // uhd
      /\bfhd\b/,         // fhd
      /\b4k\b/           // 4k
    ];
    
    // Patrones de baja calidad (copiados del código fuente)
    const lowQualityPatterns = [
      /\bsd\b/,          // sd como palabra completa
      /_sd\b/,           // _sd
      /\bsd_\w+\b/,      // sd_in, sd_out, etc.
      /\b\d+sd\b/        // variantes numéricas SD (1sd, 2sd, etc.)
    ];
    
    console.log(`  Nombre en minúsculas: "${lowerName}"`);
    
    // Probar cada patrón HD
    let isHighQuality = false;
    let matchedHDPattern = null;
    for (let i = 0; i < highQualityPatterns.length; i++) {
      const pattern = highQualityPatterns[i];
      if (pattern.test(lowerName)) {
        isHighQuality = true;
        matchedHDPattern = pattern.toString();
        break;
      }
    }
    
    // Probar cada patrón SD
    let isLowQuality = false;
    let matchedSDPattern = null;
    for (let i = 0; i < lowQualityPatterns.length; i++) {
      const pattern = lowQualityPatterns[i];
      if (pattern.test(lowerName)) {
        isLowQuality = true;
        matchedSDPattern = pattern.toString();
        break;
      }
    }
    
    console.log(`  ✓ Es alta calidad: ${isHighQuality ? 'SÍ' : 'NO'}${matchedHDPattern ? ` (patrón: ${matchedHDPattern})` : ''}`);
    console.log(`  ✓ Es baja calidad: ${isLowQuality ? 'SÍ' : 'NO'}${matchedSDPattern ? ` (patrón: ${matchedSDPattern})` : ''}`);
    
    // Determinar tipo de patrón
    let patternType = 'none';
    if (/\b4k\b/.test(lowerName)) patternType = '4k';
    else if (/\buhd\b/.test(lowerName)) patternType = 'uhd';
    else if (/\bfhd\b/.test(lowerName)) patternType = 'fhd';
    else if (/\b\d+hd\b/.test(lowerName)) patternType = 'numbered_hd';
    else if (/_hd\b/.test(lowerName)) patternType = '_hd';
    else if (/\bhd\b/.test(lowerName)) patternType = 'hd_word';
    else if (/\bsd_\w+\b/.test(lowerName)) patternType = 'sd_variant';
    else if (/_sd\b/.test(lowerName)) patternType = '_sd';
    else if (/\b\d+sd\b/.test(lowerName)) patternType = 'numbered_sd';
    else if (/\bsd\b/.test(lowerName)) patternType = 'sd_word';
    
    console.log(`  ✓ Tipo de patrón: ${patternType}`);
    
    // Prioridad del patrón
    const patternPriority = {
      '4k': 100,
      'uhd': 95,
      'fhd': 90,
      'numbered_hd': 85,
      '_hd': 80,
      'hd_word': 75,
      'sd_variant': 25,
      '_sd': 20,
      'numbered_sd': 15,
      'sd_word': 10,
      'none': 0
    };
    
    const priority = patternPriority[patternType] || 0;
    console.log(`  ✓ Prioridad: ${priority}`);
    
    console.log();
  });
}

// Ejecutar test
try {
  testQualityDetection();
} catch (error) {
  console.error('Error durante el test:', error.message);
  console.error(error.stack);
}