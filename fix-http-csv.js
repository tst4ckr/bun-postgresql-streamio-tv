/**
 * Script para corregir el formato del archivo http.csv
 * Convierte las columnas al formato esperado por Channel.fromCSV
 */

import fs from 'fs/promises';
import path from 'path';
import csv from 'csv-parser';
import { createReadStream, createWriteStream } from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

// Logger simple
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args)
};

/**
 * Corrige el formato del archivo CSV
 */
async function fixHttpCsvFormat() {
  try {
    const inputPath = path.join(process.cwd(), 'data', 'http.csv');
    const outputPath = path.join(process.cwd(), 'data', 'http_fixed.csv');
    const backupPath = path.join(process.cwd(), 'data', 'http_backup.csv');
    
    logger.info('🔧 Iniciando corrección del formato CSV...');
    
    // Crear backup del archivo original
    await fs.copyFile(inputPath, backupPath);
    logger.info(`📋 Backup creado: ${backupPath}`);
    
    const correctedChannels = [];
    let processedCount = 0;
    let errorCount = 0;
    
    // Leer archivo original
    return new Promise((resolve, reject) => {
      createReadStream(inputPath)
        .pipe(csv())
        .on('data', (row) => {
          try {
            processedCount++;
            
            // Mapear columnas al formato esperado
            const correctedRow = {
              id: row.id || `channel_${processedCount}`,
              name: row.name || 'Canal Sin Nombre',
              stream_url: row.url || row.stream_url || '', // Corregir url -> stream_url
              logo: row.logo || '',
              genre: row.genre || 'General',
              country: row.country || 'Internacional',
              language: row.language || 'es',
              quality: row.quality || 'Auto',
              type: row.type || 'tv',
              is_active: row.isActive === 'True' || row.isActive === 'true' || row.is_active === 'true' ? 'true' : 'false'
            };
            
            // Validar campos requeridos
            if (!correctedRow.name.trim() || !correctedRow.stream_url.trim()) {
              logger.warn(`Fila ${processedCount} ignorada - campos requeridos vacíos:`, {
                name: correctedRow.name,
                stream_url: correctedRow.stream_url
              });
              errorCount++;
              return;
            }
            
            correctedChannels.push(correctedRow);
            
          } catch (error) {
            logger.error(`Error procesando fila ${processedCount}:`, error);
            errorCount++;
          }
        })
        .on('end', async () => {
          try {
            logger.info(`📊 Procesamiento completado:`);
            logger.info(`   📄 Filas procesadas: ${processedCount}`);
            logger.info(`   ✅ Canales válidos: ${correctedChannels.length}`);
            logger.info(`   ❌ Errores: ${errorCount}`);
            
            if (correctedChannels.length === 0) {
              logger.error('❌ No se encontraron canales válidos para procesar');
              resolve();
              return;
            }
            
            // Configurar escritor CSV
            const csvWriter = createObjectCsvWriter({
              path: outputPath,
              header: [
                { id: 'id', title: 'id' },
                { id: 'name', title: 'name' },
                { id: 'stream_url', title: 'stream_url' },
                { id: 'logo', title: 'logo' },
                { id: 'genre', title: 'genre' },
                { id: 'country', title: 'country' },
                { id: 'language', title: 'language' },
                { id: 'quality', title: 'quality' },
                { id: 'type', title: 'type' },
                { id: 'is_active', title: 'is_active' }
              ],
              encoding: 'utf8'
            });
            
            // Escribir archivo corregido
            await csvWriter.writeRecords(correctedChannels);
            
            logger.info(`✅ Archivo corregido generado: ${outputPath}`);
            
            // Reemplazar archivo original con el corregido
            await fs.copyFile(outputPath, inputPath);
            logger.info(`🔄 Archivo original reemplazado con la versión corregida`);
            
            // Limpiar archivo temporal
            await fs.unlink(outputPath);
            
            logger.info('🎉 Corrección completada exitosamente');
            logger.info(`📋 Backup disponible en: ${backupPath}`);
            
            resolve();
            
          } catch (error) {
            logger.error('Error escribiendo archivo corregido:', error);
            reject(error);
          }
        })
        .on('error', (error) => {
          logger.error('Error leyendo archivo CSV:', error);
          reject(error);
        });
    });
    
  } catch (error) {
    logger.error('💥 Error durante la corrección:', error);
    throw error;
  }
}

// Ejecutar corrección
fixHttpCsvFormat()
  .then(() => {
    logger.info('✅ Proceso completado');
    process.exit(0);
  })
  .catch(error => {
    logger.error('💥 Error fatal:', error);
    process.exit(1);
  });