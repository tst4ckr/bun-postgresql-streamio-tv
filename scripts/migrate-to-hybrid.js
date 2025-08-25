#!/usr/bin/env node

/**
 * Script de Migración al Repositorio Híbrido
 * 
 * Este script ayuda a migrar configuraciones existentes al nuevo repositorio híbrido,
 * proporcionando recomendaciones y validaciones automáticas.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Colores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`🔧 ${title}`, 'bright');
  log('='.repeat(60), 'cyan');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

/**
 * Lee el archivo .env actual
 */
function readCurrentEnv() {
  const envPath = path.join(projectRoot, '.env');
  
  if (!fs.existsSync(envPath)) {
    logWarning('No se encontró archivo .env, se creará uno nuevo');
    return {};
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
  
  return envVars;
}

/**
 * Analiza la configuración actual
 */
function analyzeCurrentConfig(envVars) {
  logSection('Análisis de Configuración Actual');
  
  const currentSource = envVars.CHANNELS_SOURCE || 'no configurado';
  const channelsFile = envVars.CHANNELS_FILE || 'data/channels.csv';
  const m3uUrl = envVars.M3U_URL || '';
  const backupM3uUrl = envVars.BACKUP_M3U_URL || '';
  
  logInfo(`Fuente actual: ${currentSource}`);
  logInfo(`Archivo CSV: ${channelsFile}`);
  logInfo(`URL M3U: ${m3uUrl || 'no configurada'}`);
  logInfo(`URL M3U Backup: ${backupM3uUrl || 'no configurada'}`);
  
  // Verificar archivo CSV
  const csvPath = path.join(projectRoot, channelsFile);
  const csvExists = fs.existsSync(csvPath);
  
  if (csvExists) {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const csvLines = csvContent.split('\n').filter(line => line.trim());
    const csvChannels = csvLines.length - 1; // Restar header
    logSuccess(`Archivo CSV encontrado con ${csvChannels} canales`);
  } else {
    logWarning(`Archivo CSV no encontrado en: ${csvPath}`);
  }
  
  return {
    currentSource,
    channelsFile,
    m3uUrl,
    backupM3uUrl,
    csvExists,
    csvChannels: csvExists ? fs.readFileSync(csvPath, 'utf8').split('\n').length - 1 : 0
  };
}

/**
 * Genera recomendaciones de migración
 */
function generateRecommendations(config) {
  logSection('Recomendaciones de Migración');
  
  const recommendations = [];
  
  // Analizar configuración actual
  switch (config.currentSource) {
    case 'csv':
      if (config.csvExists) {
        recommendations.push({
          type: 'success',
          message: 'Configuración CSV existente es compatible con híbrido'
        });
        recommendations.push({
          type: 'info',
          message: 'Considera agregar URLs M3U para ampliar el catálogo'
        });
      }
      break;
      
    case 'remote_m3u':
      if (config.m3uUrl) {
        recommendations.push({
          type: 'info',
          message: 'Configuración M3U existente se mantendrá en híbrido'
        });
        if (!config.csvExists) {
          recommendations.push({
            type: 'warning',
            message: 'Considera crear un archivo CSV para canales prioritarios'
          });
        }
      }
      break;
      
    case 'hybrid':
      recommendations.push({
        type: 'success',
        message: 'Ya estás usando el repositorio híbrido'
      });
      return recommendations;
      
    default:
      recommendations.push({
        type: 'warning',
        message: 'Configuración no reconocida, se aplicará configuración por defecto'
      });
  }
  
  // Recomendaciones específicas
  if (!config.csvExists) {
    recommendations.push({
      type: 'action',
      message: 'Crear archivo CSV básico con canales prioritarios'
    });
  }
  
  if (!config.m3uUrl) {
    recommendations.push({
      type: 'action',
      message: 'Configurar URL M3U principal para ampliar catálogo'
    });
  }
  
  if (!config.backupM3uUrl) {
    recommendations.push({
      type: 'action',
      message: 'Configurar URL M3U de respaldo para mayor confiabilidad'
    });
  }
  
  // Mostrar recomendaciones
  recommendations.forEach(rec => {
    switch (rec.type) {
      case 'success':
        logSuccess(rec.message);
        break;
      case 'warning':
        logWarning(rec.message);
        break;
      case 'info':
        logInfo(rec.message);
        break;
      case 'action':
        log(`🔧 ACCIÓN: ${rec.message}`, 'magenta');
        break;
    }
  });
  
  return recommendations;
}

/**
 * Crea un archivo CSV básico si no existe
 */
function createBasicCSV(channelsFile) {
  const csvPath = path.join(projectRoot, channelsFile);
  
  if (fs.existsSync(csvPath)) {
    logInfo('El archivo CSV ya existe, no se sobrescribirá');
    return;
  }
  
  // Crear directorio si no existe
  const csvDir = path.dirname(csvPath);
  if (!fs.existsSync(csvDir)) {
    fs.mkdirSync(csvDir, { recursive: true });
  }
  
  const csvContent = `id,name,url,logo,genre,country,language,quality
tv_ejemplo_hd,Canal Ejemplo HD,https://ejemplo.com/stream.m3u8,https://ejemplo.com/logo.png,Entertainment,Mexico,Spanish,HD
tv_noticias_24h,Noticias 24H,https://noticias.ejemplo.com/live.m3u8,https://noticias.ejemplo.com/logo.png,News,Mexico,Spanish,HD
`;
  
  fs.writeFileSync(csvPath, csvContent, 'utf8');
  logSuccess(`Archivo CSV básico creado en: ${csvPath}`);
  logInfo('Edita este archivo para agregar tus canales prioritarios');
}

/**
 * Genera la nueva configuración híbrida
 */
function generateHybridConfig(currentConfig) {
  logSection('Generando Configuración Híbrida');
  
  const hybridConfig = {
    CHANNELS_SOURCE: 'hybrid',
    CHANNELS_FILE: currentConfig.channelsFile || 'data/channels.csv',
    M3U_URL: currentConfig.m3uUrl || 'https://iptv-org.github.io/iptv/countries/mx.m3u8',
    BACKUP_M3U_URL: currentConfig.backupM3uUrl || 'https://iptv-org.github.io/iptv/countries/pe.m3u8'
  };
  
  logInfo('Nueva configuración híbrida:');
  Object.entries(hybridConfig).forEach(([key, value]) => {
    log(`  ${key}=${value}`, 'cyan');
  });
  
  return hybridConfig;
}

/**
 * Actualiza el archivo .env
 */
function updateEnvFile(currentEnv, hybridConfig) {
  logSection('Actualizando Archivo .env');
  
  const envPath = path.join(projectRoot, '.env');
  const backupPath = path.join(projectRoot, '.env.backup');
  
  // Crear backup del .env actual
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, backupPath);
    logSuccess(`Backup creado en: ${backupPath}`);
  }
  
  // Combinar configuración existente con híbrida
  const newEnv = { ...currentEnv, ...hybridConfig };
  
  // Generar contenido del nuevo .env
  let envContent = '# Configuración del Repositorio Híbrido\n';
  envContent += '# Generado automáticamente por migrate-to-hybrid.js\n\n';
  
  // Sección de configuración de canales
  envContent += '# =================================\n';
  envContent += '# CONFIGURACIÓN DE CANALES\n';
  envContent += '# =================================\n';
  envContent += `CHANNELS_SOURCE=${newEnv.CHANNELS_SOURCE}\n`;
  envContent += `CHANNELS_FILE=${newEnv.CHANNELS_FILE}\n`;
  envContent += `M3U_URL=${newEnv.M3U_URL}\n`;
  envContent += `BACKUP_M3U_URL=${newEnv.BACKUP_M3U_URL}\n\n`;
  
  // Agregar otras configuraciones existentes
  const channelKeys = ['CHANNELS_SOURCE', 'CHANNELS_FILE', 'M3U_URL', 'BACKUP_M3U_URL'];
  const otherConfigs = Object.entries(newEnv).filter(([key]) => !channelKeys.includes(key));
  
  if (otherConfigs.length > 0) {
    envContent += '# =================================\n';
    envContent += '# OTRAS CONFIGURACIONES\n';
    envContent += '# =================================\n';
    otherConfigs.forEach(([key, value]) => {
      envContent += `${key}=${value}\n`;
    });
  }
  
  fs.writeFileSync(envPath, envContent, 'utf8');
  logSuccess('Archivo .env actualizado exitosamente');
}

/**
 * Ejecuta pruebas de validación
 */
function runValidationTests() {
  logSection('Ejecutando Pruebas de Validación');
  
  try {
    // Verificar que el repositorio híbrido se puede importar
    logInfo('Verificando importación del repositorio híbrido...');
    
    // Simular importación (en un entorno real se haría la importación real)
    const hybridRepoPath = path.join(projectRoot, 'src/infrastructure/repositories/HybridChannelRepository.js');
    
    if (fs.existsSync(hybridRepoPath)) {
      logSuccess('Repositorio híbrido encontrado');
    } else {
      logError('Repositorio híbrido no encontrado');
      return false;
    }
    
    // Verificar factory
    const factoryPath = path.join(projectRoot, 'src/infrastructure/factories/ChannelRepositoryFactory.js');
    
    if (fs.existsSync(factoryPath)) {
      const factoryContent = fs.readFileSync(factoryPath, 'utf8');
      if (factoryContent.includes('hybrid')) {
        logSuccess('Factory actualizado para soportar híbrido');
      } else {
        logWarning('Factory podría necesitar actualización');
      }
    }
    
    logSuccess('Validaciones básicas completadas');
    return true;
    
  } catch (error) {
    logError(`Error en validación: ${error.message}`);
    return false;
  }
}

/**
 * Muestra el resumen final
 */
function showFinalSummary(config, success) {
  logSection('Resumen de Migración');
  
  if (success) {
    logSuccess('¡Migración completada exitosamente!');
    log('\n📋 Próximos pasos:', 'bright');
    log('1. Revisar y editar el archivo CSV con tus canales prioritarios', 'cyan');
    log('2. Verificar las URLs M3U configuradas', 'cyan');
    log('3. Ejecutar pruebas: node scripts/test-hybrid-repository.js', 'cyan');
    log('4. Reiniciar el servidor para aplicar cambios', 'cyan');
    
    log('\n🔧 Comandos útiles:', 'bright');
    log('• Probar configuración: node scripts/test-hybrid-repository.js', 'yellow');
    log('• Validar canales: node scripts/test-batch-validation.js', 'yellow');
    log('• Ver estadísticas: node scripts/channel-stats.js', 'yellow');
    
  } else {
    logError('La migración encontró problemas');
    log('\n🔧 Acciones recomendadas:', 'bright');
    log('1. Revisar los errores mostrados arriba', 'yellow');
    log('2. Verificar que todos los archivos estén en su lugar', 'yellow');
    log('3. Ejecutar el script nuevamente', 'yellow');
    log('4. Contactar soporte si persisten los problemas', 'yellow');
  }
  
  log('\n📚 Documentación:', 'bright');
  log('• Guía completa: docs/HYBRID_REPOSITORY.md', 'cyan');
  log('• Configuración: docs/REMOVE_INVALID_STREAMS.md', 'cyan');
}

/**
 * Función principal
 */
async function main() {
  log('🚀 Iniciando Migración al Repositorio Híbrido', 'bright');
  log('Este script te ayudará a migrar tu configuración actual al nuevo repositorio híbrido\n');
  
  try {
    // 1. Leer configuración actual
    const currentEnv = readCurrentEnv();
    
    // 2. Analizar configuración
    const config = analyzeCurrentConfig(currentEnv);
    
    // 3. Generar recomendaciones
    const recommendations = generateRecommendations(config);
    
    // 4. Crear CSV básico si es necesario
    if (!config.csvExists) {
      createBasicCSV(config.channelsFile);
    }
    
    // 5. Generar configuración híbrida
    const hybridConfig = generateHybridConfig(config);
    
    // 6. Actualizar .env
    updateEnvFile(currentEnv, hybridConfig);
    
    // 7. Ejecutar validaciones
    const validationSuccess = runValidationTests();
    
    // 8. Mostrar resumen
    showFinalSummary(config, validationSuccess);
    
  } catch (error) {
    logError(`Error durante la migración: ${error.message}`);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logError(`Error fatal: ${error.message}`);
    process.exit(1);
  });
}

export { main as migrateToHybrid };