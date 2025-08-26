#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import TVAddonConfig from '../src/infrastructure/config/TVAddonConfig.js';
import HybridChannelRepository from '../src/infrastructure/repositories/HybridChannelRepository.js';
import ContentFilterService from '../src/domain/services/ContentFilterService.js';
// Logger simple para debug
const logger = {
    info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args),
    debug: (msg, ...args) => console.debug(`[DEBUG] ${new Date().toISOString()} - ${msg}`, ...args)
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function debugReligiousFiltering() {
    
    try {
        logger.info('🔍 Iniciando debug de filtrado religioso...');
        
        // Configuración
        const config = TVAddonConfig.getInstance();
        const originalConfig = config.getAll();
        
        // Obtener todos los canales SIN filtros
        logger.info('📡 Obteniendo canales sin filtros...');
        
        const configWithoutFilters = {
            ...originalConfig,
            filters: {
                ...originalConfig.filters,
                filterReligiousContent: false,
                filterAdultContent: false,
                filterPoliticalContent: false
            }
        };
        
        const mockConfigWithoutFilters = {
            getAll: () => configWithoutFilters,
            filters: configWithoutFilters.filters,
            dataSources: configWithoutFilters.dataSources,
            streaming: configWithoutFilters.streaming,
            validation: configWithoutFilters.validation,
            logging: configWithoutFilters.logging
        };
        
        const csvPath = originalConfig.dataSources.channelsFile;
        const m3uSources = [
            originalConfig.dataSources.m3uUrl,
            originalConfig.dataSources.backupM3uUrl,
            originalConfig.dataSources.m3uUrl1,
            originalConfig.dataSources.m3uUrl2,
            originalConfig.dataSources.m3uUrl3,
            originalConfig.dataSources.localM3uLatam1,
            originalConfig.dataSources.localM3uLatam2,
            originalConfig.dataSources.localM3uLatam3,
            originalConfig.dataSources.localM3uLatam4,
            originalConfig.dataSources.localM3uIndex
        ].filter(source => source && source.trim() !== '');
        
        const repositoryWithoutFilters = new HybridChannelRepository(csvPath, m3uSources, mockConfigWithoutFilters, logger);
        const allChannels = await repositoryWithoutFilters.getAllChannels();
        
        // Crear filtro de contenido para análisis
        const contentFilter = new ContentFilterService(originalConfig.filters);
        
        // Analizar cada canal individualmente
        logger.info('🔍 Analizando canales individualmente...');
        
        const religiousKeywords = originalConfig.filters.religiousKeywords || [];
        logger.info(`📋 Palabras clave religiosas configuradas: ${religiousKeywords.length}`);
        logger.info(`🔑 Palabras: ${religiousKeywords.slice(0, 10).join(', ')}${religiousKeywords.length > 10 ? '...' : ''}`);
        
        let religiousChannelsFound = [];
        let religiousChannelsFiltered = [];
        
        for (const channel of allChannels) {
            // Crear texto completo del canal incluyendo URL
            const textParts = [];
            if (channel.name) textParts.push(channel.name);
            if (channel.title) textParts.push(channel.title);
            if (channel.description) textParts.push(channel.description);
            if (channel.category) textParts.push(channel.category);
            if (channel.group) textParts.push(channel.group);
            if (Array.isArray(channel.genres)) textParts.push(...channel.genres);
            
            // Agregar URL y dominio
            if (channel.url) {
                textParts.push(channel.url);
                try {
                    const url = new URL(channel.url);
                    textParts.push(url.hostname);
                } catch (e) {
                    // URL inválida, ya agregada como texto
                }
            }
            
            if (channel.stream && channel.stream !== channel.url) {
                textParts.push(channel.stream);
                try {
                    const streamUrl = new URL(channel.stream);
                    textParts.push(streamUrl.hostname);
                } catch (e) {
                    // URL inválida, ya agregada como texto
                }
            }
            
            const fullText = textParts.join(' ').toLowerCase();
            
            // Buscar palabras clave religiosas
            const foundKeywords = religiousKeywords.filter(keyword => 
                fullText.includes(keyword.toLowerCase())
            );
            
            if (foundKeywords.length > 0) {
                religiousChannelsFound.push({
                    channel,
                    keywords: foundKeywords,
                    fullText
                });
                
                // Verificar si el filtro lo bloquearía
                const wouldBeFiltered = !contentFilter.filterChannels([channel]).length;
                if (wouldBeFiltered) {
                    religiousChannelsFiltered.push({
                        channel,
                        keywords: foundKeywords
                    });
                }
            }
        }
        
        logger.info('');
        logger.info('📊 RESULTADOS DEL DEBUG:');
        logger.info(`Total de canales analizados: ${allChannels.length}`);
        logger.info(`Canales con contenido religioso detectado: ${religiousChannelsFound.length}`);
        logger.info(`Canales que serían filtrados: ${religiousChannelsFiltered.length}`);
        logger.info(`Canales religiosos NO filtrados: ${religiousChannelsFound.length - religiousChannelsFiltered.length}`);
        
        logger.info('');
        logger.info('🔍 CANALES RELIGIOSOS NO FILTRADOS:');
        
        const notFiltered = religiousChannelsFound.filter(item => 
            !religiousChannelsFiltered.some(filtered => 
                filtered.channel.name === item.channel.name
            )
        );
        
        notFiltered.forEach((item, index) => {
            logger.info(`${index + 1}. ${item.channel.name}`);
            logger.info(`   URL: ${item.channel.url || 'N/A'}`);
            logger.info(`   Stream: ${item.channel.stream || 'N/A'}`);
            logger.info(`   Palabras encontradas: ${item.keywords.join(', ')}`);
            logger.info(`   Grupo: ${item.channel.group || 'N/A'}`);
            logger.info(`   Categoría: ${item.channel.category || 'N/A'}`);
            logger.info('');
        });
        
        logger.info('✅ Debug completado');
        
    } catch (error) {
        logger.error('❌ Error durante el debug:', error);
        process.exit(1);
    }
}

debugReligiousFiltering();