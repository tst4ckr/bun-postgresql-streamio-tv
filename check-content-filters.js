#!/usr/bin/env node
/**
 * Script para verificar el estado de los filtros de contenido religioso y político
 */

import { TVAddonConfig } from './src/infrastructure/config/TVAddonConfig.js';
import ContentFilterService from './src/domain/services/ContentFilterService.js';

const logger = {
  info: (message) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`),
  warn: (message) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`),
  error: (message) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`)
};

async function checkContentFilters() {
  try {
    logger.info('🔍 Verificando configuración de filtros de contenido...');
    
    // Obtener configuración
    const config = TVAddonConfig.getInstance();
    const filterConfig = config.getConfig().filters;
    
    logger.info('\n📋 CONFIGURACIÓN DE FILTROS:');
    logger.info(`Filtro religioso: ${filterConfig.filterReligiousContent ? '✅ ACTIVO' : '❌ INACTIVO'}`);
    logger.info(`Filtro adulto: ${filterConfig.filterAdultContent ? '✅ ACTIVO' : '❌ INACTIVO'}`);
    logger.info(`Filtro político: ${filterConfig.filterPoliticalContent ? '✅ ACTIVO' : '❌ INACTIVO'}`);
    
    // Crear servicio de filtros
    const contentFilter = new ContentFilterService(filterConfig);
    
    // Verificar si hay filtros activos
    const hasActiveFilters = contentFilter.hasActiveFilters();
    logger.info(`\n🎯 Estado general: ${hasActiveFilters ? '✅ FILTROS ACTIVOS' : '❌ FILTROS INACTIVOS'}`);
    
    // Obtener configuración detallada
    const detailedConfig = contentFilter.getFilterConfiguration();
    
    logger.info('\n📊 CONFIGURACIÓN DETALLADA:');
    logger.info(`Religioso: ${detailedConfig.religious.enabled ? 'Activo' : 'Inactivo'} (${detailedConfig.religious.keywordCount} palabras clave)`);
    logger.info(`Adulto: ${detailedConfig.adult.enabled ? 'Activo' : 'Inactivo'} (${detailedConfig.adult.keywordCount} palabras clave)`);
    logger.info(`Político: ${detailedConfig.political.enabled ? 'Activo' : 'Inactivo'} (${detailedConfig.political.keywordCount} palabras clave)`);
    
    // Mostrar algunas palabras clave
    if (filterConfig.religiousKeywords && filterConfig.religiousKeywords.length > 0) {
      logger.info(`\n🔍 Palabras clave religiosas (primeras 10): ${filterConfig.religiousKeywords.slice(0, 10).join(', ')}`);
    }
    
    if (filterConfig.politicalKeywords && filterConfig.politicalKeywords.length > 0) {
      logger.info(`🔍 Palabras clave políticas (primeras 10): ${filterConfig.politicalKeywords.slice(0, 10).join(', ')}`);
    }
    
    // Probar con canales de ejemplo
    const testChannels = [
      { id: '1', name: 'CNN Español', genre: 'News' },
      { id: '2', name: 'Iglesia TV', genre: 'Religious' },
      { id: '3', name: 'Cristo Visión', genre: 'Religious' },
      { id: '4', name: 'Canal Político', genre: 'News' },
      { id: '5', name: 'Discovery Channel', genre: 'Documentary' }
    ];
    
    logger.info('\n🧪 PRUEBA CON CANALES DE EJEMPLO:');
    const filteredChannels = contentFilter.filterChannels(testChannels);
    
    logger.info(`Canales originales: ${testChannels.length}`);
    logger.info(`Canales después del filtro: ${filteredChannels.length}`);
    logger.info(`Canales removidos: ${testChannels.length - filteredChannels.length}`);
    
    testChannels.forEach(channel => {
      const wasFiltered = !filteredChannels.find(fc => fc.id === channel.id);
      logger.info(`  ${channel.name}: ${wasFiltered ? '❌ FILTRADO' : '✅ PERMITIDO'}`);
    });
    
    logger.info('\n✅ Verificación completada');
    
  } catch (error) {
    logger.error('❌ Error durante la verificación:', error.message);
    process.exit(1);
  }
}

checkContentFilters();