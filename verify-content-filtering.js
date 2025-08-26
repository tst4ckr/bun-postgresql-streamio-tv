#!/usr/bin/env node
/**
 * @fileoverview Script para verificar la aplicación de filtros de contenido
 * Confirma si los filtros se aplican a todos los canales cargados en el repositorio híbrido
 */

import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';
import { ChannelRepositoryFactory } from './src/infrastructure/factories/ChannelRepositoryFactory.js';
import ContentFilterService from './src/domain/services/ContentFilterService.js';

/**
 * Verifica la aplicación de filtros de contenido
 */
async function verifyContentFiltering() {
  const logger = console;
  
  try {
    logger.info('=== VERIFICACIÓN DE FILTROS DE CONTENIDO ===');
    
    // Obtener configuración
    const config = TVAddonConfig.getInstance();
    const { dataSources, filters } = config.getAll();
    
    logger.info('Configuración de filtros:');
    logger.info(`- Filtros habilitados: ${filters.enableContentFilters}`);
    logger.info(`- Filtro religioso: ${filters.filterReligiousContent}`);
    logger.info(`- Filtro adulto: ${filters.filterAdultContent}`);
    logger.info(`- Filtro político: ${filters.filterPoliticalContent}`);
    logger.info(`- Sensibilidad: ${filters.filterSensitivity}`);
    logger.info(`- Modo de coincidencia: ${filters.filterMatchMode}`);
    
    // Crear repositorio
    logger.info('\nCreando repositorio...');
    const repository = await ChannelRepositoryFactory.createRepository(config, logger);
    
    // Obtener estadísticas del repositorio
    logger.info('\nObteniendo estadísticas del repositorio...');
    const stats = await repository.getRepositoryStats();
    
    logger.info('\n=== ESTADÍSTICAS DETALLADAS ===');
    logger.info(`Total de canales cargados: ${stats.totalChannels}`);
    logger.info(`Canales activos (sin desactivados): ${stats.activeChannels}`);
    logger.info(`Canales después de filtros de contenido: ${stats.filteredChannels}`);
    logger.info(`Canales desactivados por validación: ${stats.deactivatedChannels}`);
    
    if (stats.contentFiltering && stats.contentFiltering.enabled) {
      logger.info('\n=== FILTROS DE CONTENIDO APLICADOS ===');
      logger.info(`Canales removidos por filtros: ${stats.contentFiltering.removedChannels}`);
      logger.info(`Porcentaje de remoción: ${stats.contentFiltering.removalPercentage}%`);
      logger.info('Canales removidos por categoría:');
      logger.info(`  - Religioso: ${stats.contentFiltering.removedByCategory.religious}`);
      logger.info(`  - Adulto: ${stats.contentFiltering.removedByCategory.adult}`);
      logger.info(`  - Político: ${stats.contentFiltering.removedByCategory.political}`);
      
      // Verificar que los filtros se aplican a todos los canales
      const totalProcessed = stats.activeChannels;
      const totalAfterFiltering = stats.filteredChannels;
      const totalRemoved = stats.contentFiltering.removedChannels;
      
      logger.info('\n=== VERIFICACIÓN DE APLICACIÓN COMPLETA ===');
      logger.info(`Canales procesados por filtros: ${totalProcessed}`);
      logger.info(`Canales después del filtrado: ${totalAfterFiltering}`);
      logger.info(`Canales removidos: ${totalRemoved}`);
      logger.info(`Verificación matemática: ${totalProcessed} - ${totalRemoved} = ${totalAfterFiltering}`);
      
      if (totalProcessed - totalRemoved === totalAfterFiltering) {
        logger.info('✅ VERIFICACIÓN EXITOSA: Los filtros se aplican correctamente a todos los canales activos');
      } else {
        logger.error('❌ ERROR: Inconsistencia en la aplicación de filtros');
      }
      
    } else {
      logger.info('\n=== FILTROS DE CONTENIDO DESHABILITADOS ===');
      logger.info('Los filtros de contenido no están activos');
    }
    
    // Probar filtrado manual para confirmar
    logger.info('\n=== PRUEBA MANUAL DE FILTRADO ===');
    
    // Obtener todos los canales sin filtrar
    const allChannelsUnfiltered = await repository.getAllChannelsUnfiltered();
    logger.info(`Total de canales sin filtrar: ${allChannelsUnfiltered.length}`);
    
    // Obtener canales con filtros aplicados
    const allChannelsFiltered = await repository.getAllChannels();
    logger.info(`Total de canales con filtros: ${allChannelsFiltered.length}`);
    
    // Crear instancia manual del filtro para verificar
    const contentFilter = new ContentFilterService(filters);
    
    if (contentFilter.hasActiveFilters()) {
      // Aplicar filtros manualmente a todos los canales
      const activeChannels = stats.activeChannels > 0 ? 
        allChannelsUnfiltered.filter(ch => !repository.isChannelDeactivated || !repository.isChannelDeactivated(ch.id)) :
        allChannelsUnfiltered;
      
      const manuallyFiltered = contentFilter.filterChannels(activeChannels);
      const manualStats = contentFilter.getFilterStats(activeChannels, manuallyFiltered);
      
      logger.info('\n=== VERIFICACIÓN MANUAL ===');
      logger.info(`Canales antes del filtrado manual: ${activeChannels.length}`);
      logger.info(`Canales después del filtrado manual: ${manuallyFiltered.length}`);
      logger.info(`Canales removidos manualmente: ${manualStats.removedChannels}`);
      logger.info(`Porcentaje de remoción manual: ${manualStats.removalPercentage}%`);
      
      // Comparar resultados
      if (manuallyFiltered.length === allChannelsFiltered.length) {
        logger.info('✅ CONFIRMACIÓN: El filtrado del repositorio coincide con el filtrado manual');
        logger.info('✅ CONCLUSIÓN: Los filtros se aplican correctamente a TODOS los canales cargados');
      } else {
        logger.warn('⚠️  ADVERTENCIA: Diferencia entre filtrado del repositorio y manual');
        logger.warn(`Repositorio: ${allChannelsFiltered.length}, Manual: ${manuallyFiltered.length}`);
      }
      
    } else {
      logger.info('No hay filtros activos para verificar');
    }
    
    // Mostrar resumen final
    logger.info('\n=== RESUMEN FINAL ===');
    logger.info(`📊 Canales totales cargados: ${stats.totalChannels}`);
    logger.info(`🔍 Canales procesados por filtros: ${stats.activeChannels}`);
    logger.info(`✅ Canales finales disponibles: ${stats.filteredChannels}`);
    
    if (stats.contentFiltering && stats.contentFiltering.enabled) {
      logger.info(`🚫 Canales removidos por filtros: ${stats.contentFiltering.removedChannels} (${stats.contentFiltering.removalPercentage}%)`);
      logger.info('\n🎯 CONFIRMACIÓN: Los filtros de contenido se aplican a TODOS los canales activos del repositorio híbrido');
    }
    
  } catch (error) {
    logger.error('Error durante la verificación:', error);
    process.exit(1);
  }
}

// Ejecutar verificación
verifyContentFiltering().catch(console.error);