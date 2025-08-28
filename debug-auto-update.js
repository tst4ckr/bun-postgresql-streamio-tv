/**
 * Script para debuggear el problema de auto-actualización
 * que elimina canales CSV del repositorio híbrido
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { HybridChannelRepository } from './src/infrastructure/repositories/HybridChannelRepository.js';
import { CSVChannelRepository } from './src/infrastructure/repositories/CSVChannelRepository.js';
// Logger simple como en el proyecto
const logger = {
  info: (message, ...args) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
  },
  warn: (message, ...args) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
  },
  debug: (message, ...args) => {
    console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
  }
};
import TVAddonConfig from './src/infrastructure/config/TVAddonConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function debugAutoUpdate() {
  console.log('🔍 === DEBUG: Auto-actualización de canales ===\n');
  
  try {
    // Cargar configuración
    const config = TVAddonConfig.getInstance();
    // Logger ya está definido arriba
    
    // Configurar rutas
    const csvPath = path.join(__dirname, 'data', 'channels.csv');
    const m3uSources = config.dataSources.m3uUrls || [];
    
    console.log(`📁 Archivo CSV: ${csvPath}`);
    console.log(`📡 Fuentes M3U: ${m3uSources.length} configuradas\n`);
    
    // === PASO 1: Verificar estado inicial del CSV ===
    console.log('📋 PASO 1: Verificando estado inicial del CSV...');
    const csvRepo = new CSVChannelRepository(csvPath, config, logger);
    await csvRepo.initialize();
    const initialCsvChannels = await csvRepo.getAllChannelsUnfiltered();
    console.log(`✅ CSV inicial: ${initialCsvChannels.length} canales`);
    
    if (initialCsvChannels.length > 0) {
      console.log(`   Primeros 3 canales CSV:`);
      initialCsvChannels.slice(0, 3).forEach((ch, i) => {
        console.log(`   ${i + 1}. ${ch.name} (${ch.id})`);
      });
    }
    console.log('');
    
    // === PASO 2: Crear repositorio híbrido ===
    console.log('🔧 PASO 2: Creando repositorio híbrido...');
    const hybridRepo = new HybridChannelRepository(csvPath, m3uSources, config, logger);
    await hybridRepo.initialize();
    
    const initialHybridChannels = await hybridRepo.getAllChannelsUnfiltered();
    console.log(`✅ Híbrido inicial: ${initialHybridChannels.length} canales`);
    
    // Contar canales CSV en el híbrido
    const csvChannelIds = new Set(initialCsvChannels.map(ch => ch.id));
    const csvInHybrid = initialHybridChannels.filter(ch => csvChannelIds.has(ch.id));
    console.log(`   Canales CSV en híbrido: ${csvInHybrid.length}/${initialCsvChannels.length}`);
    console.log('');
    
    // === PASO 3: Simular auto-actualización ===
    console.log('🔄 PASO 3: Simulando auto-actualización...');
    console.log('   Ejecutando refreshFromRemote()...');
    
    await hybridRepo.refreshFromRemote();
    
    const afterRefreshChannels = await hybridRepo.getAllChannelsUnfiltered();
    console.log(`✅ Híbrido después del refresh: ${afterRefreshChannels.length} canales`);
    
    // Verificar canales CSV después del refresh
    const csvAfterRefresh = afterRefreshChannels.filter(ch => csvChannelIds.has(ch.id));
    console.log(`   Canales CSV después del refresh: ${csvAfterRefresh.length}/${initialCsvChannels.length}`);
    
    if (csvAfterRefresh.length !== initialCsvChannels.length) {
      console.log('❌ PROBLEMA DETECTADO: Se perdieron canales CSV durante el refresh!');
      
      const lostChannels = initialCsvChannels.filter(ch => 
        !afterRefreshChannels.some(ach => ach.id === ch.id)
      );
      
      console.log(`   Canales CSV perdidos: ${lostChannels.length}`);
      if (lostChannels.length > 0) {
        console.log('   Primeros 5 canales perdidos:');
        lostChannels.slice(0, 5).forEach((ch, i) => {
          console.log(`   ${i + 1}. ${ch.name} (${ch.id})`);
        });
      }
    } else {
      console.log('✅ Todos los canales CSV se preservaron correctamente');
    }
    
    console.log('');
    
    // === PASO 4: Verificar estado del CSV después del refresh ===
    console.log('📋 PASO 4: Verificando estado del CSV después del refresh...');
    const csvAfterRefreshRepo = new CSVChannelRepository(csvPath, config, logger);
    await csvAfterRefreshRepo.initialize();
    const csvChannelsAfterRefresh = await csvAfterRefreshRepo.getAllChannelsUnfiltered();
    console.log(`✅ CSV después del refresh: ${csvChannelsAfterRefresh.length} canales`);
    
    if (csvChannelsAfterRefresh.length !== initialCsvChannels.length) {
      console.log('❌ PROBLEMA: El archivo CSV cambió durante el proceso!');
    } else {
      console.log('✅ El archivo CSV se mantuvo intacto');
    }
    
    console.log('');
    console.log('🏁 === FIN DEL DEBUG ===');
    
  } catch (error) {
    console.error('❌ Error durante el debug:', error);
    process.exit(1);
  }
}

// Ejecutar debug
debugAutoUpdate().catch(console.error);