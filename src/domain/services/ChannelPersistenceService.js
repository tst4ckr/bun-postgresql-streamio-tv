/**
 * @fileoverview ChannelPersistenceService - Servicio para persistir cambios en canales
 * Responsabilidad única: gestión de persistencia de canales actualizados
 */

import { createObjectCsvWriter } from 'csv-writer';
import { RepositoryError } from '../repositories/ChannelRepository.js';

/**
 * Servicio para persistir cambios en canales
 * Implementa la funcionalidad de escritura de canales actualizados al archivo CSV
 */
export class ChannelPersistenceService {
  /**
   * @private
   */
  #config;
  #logger;

  /**
   * @param {Object} config - Configuración del addon
   * @param {Object} logger - Logger para trazabilidad
   */
  constructor(config, logger = console) {
    this.#config = config;
    this.#logger = logger;
  }

  /**
   * Persiste canales actualizados al archivo CSV
   * @param {Array<Channel>} channels - Canales a persistir
   * @param {string} filePath - Ruta del archivo CSV
   * @returns {Promise<void>}
   * @throws {RepositoryError}
   */
  async persistChannelsToCSV(channels, filePath) {
    try {
      this.#logger.info(`Persistiendo ${channels.length} canales al archivo CSV: ${filePath}`);

      // Configurar el escritor CSV
      const csvWriter = createObjectCsvWriter({
        path: filePath,
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

      // Convertir canales al formato CSV
      const csvRecords = channels.map(channel => this.#channelToCSVRecord(channel));

      // Escribir al archivo
      await csvWriter.writeRecords(csvRecords);

      this.#logger.info(`✅ ${channels.length} canales persistidos exitosamente en ${filePath}`);

    } catch (error) {
      const errorMsg = `Error persistiendo canales al CSV: ${error.message}`;
      this.#logger.error(errorMsg, error);
      throw new RepositoryError(errorMsg, error);
    }
  }

  /**
   * Crea una copia de respaldo del archivo CSV antes de sobrescribirlo
   * @param {string} filePath - Ruta del archivo original
   * @returns {Promise<string>} - Ruta del archivo de respaldo
   * @throws {RepositoryError}
   */
  async createBackup(filePath) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${filePath}.backup-${timestamp}`;
      
      // Verificar si el archivo original existe
      const fs = await import('fs');
      if (fs.existsSync(filePath)) {
        await fs.promises.copyFile(filePath, backupPath);
        this.#logger.info(`📋 Respaldo creado: ${backupPath}`);
        return backupPath;
      } else {
        this.#logger.warn(`⚠️  Archivo original no existe, no se creará respaldo: ${filePath}`);
        return null;
      }
    } catch (error) {
      const errorMsg = `Error creando respaldo del CSV: ${error.message}`;
      this.#logger.error(errorMsg, error);
      throw new RepositoryError(errorMsg, error);
    }
  }

  /**
   * Persiste canales con respaldo automático
   * @param {Array<Channel>} channels - Canales a persistir
   * @param {string} filePath - Ruta del archivo CSV
   * @param {boolean} createBackup - Si crear respaldo antes de sobrescribir
   * @returns {Promise<{backupPath: string|null, channelsPersisted: number}>}
   * @throws {RepositoryError}
   */
  async persistChannelsWithBackup(channels, filePath, createBackup = true) {
    let backupPath = null;

    try {
      // Crear respaldo si se solicita
      if (createBackup) {
        backupPath = await this.createBackup(filePath);
      }

      // Persistir canales
      await this.persistChannelsToCSV(channels, filePath);

      return {
        backupPath,
        channelsPersisted: channels.length
      };

    } catch (error) {
      // Si hay error y se creó respaldo, intentar restaurar
      if (backupPath) {
        try {
          const fs = await import('fs');
          await fs.promises.copyFile(backupPath, filePath);
          this.#logger.warn(`🔄 Archivo restaurado desde respaldo debido a error`);
        } catch (restoreError) {
          this.#logger.error(`❌ Error restaurando respaldo: ${restoreError.message}`);
        }
      }
      throw error;
    }
  }

  /**
   * Convierte un canal al formato de registro CSV
   * @private
   * @param {Channel} channel - Canal a convertir
   * @returns {Object} - Registro CSV
   */
  #channelToCSVRecord(channel) {
    return {
      id: channel.id || '',
      name: channel.name || '',
      stream_url: channel.streamUrl || '',
      logo: channel.logo || '',
      genre: channel.genre || 'General',
      country: channel.country || 'Internacional',
      language: channel.language || 'es',
      quality: channel.quality || 'AUTO',
      type: channel.type || 'TV',
      is_active: channel.isActive !== false ? 'true' : 'false'
    };
  }

  /**
   * Valida que los canales tengan los campos mínimos requeridos
   * @param {Array<Channel>} channels - Canales a validar
   * @returns {Array<Channel>} - Canales válidos
   * @throws {RepositoryError}
   */
  validateChannelsForPersistence(channels) {
    const validChannels = [];
    const invalidChannels = [];

    channels.forEach((channel, index) => {
      if (!channel.name || !channel.streamUrl) {
        invalidChannels.push({ index, channel, reason: 'Faltan campos requeridos (name, streamUrl)' });
      } else {
        validChannels.push(channel);
      }
    });

    if (invalidChannels.length > 0) {
      this.#logger.warn(`⚠️  ${invalidChannels.length} canales inválidos omitidos:`);
      invalidChannels.forEach(({ index, reason }) => {
        this.#logger.warn(`  - Canal ${index}: ${reason}`);
      });
    }

    if (validChannels.length === 0) {
      throw new RepositoryError('No hay canales válidos para persistir');
    }

    this.#logger.info(`✅ ${validChannels.length} canales válidos para persistencia`);
    return validChannels;
  }

  /**
   * Obtiene estadísticas de los canales a persistir
   * @param {Array<Channel>} channels - Canales a analizar
   * @returns {Object} - Estadísticas
   */
  getChannelStatistics(channels) {
    const stats = {
      total: channels.length,
      byProtocol: { http: 0, https: 0, other: 0 },
      byCountry: {},
      byGenre: {},
      active: 0,
      inactive: 0
    };

    channels.forEach(channel => {
      // Protocolo
      if (channel.streamUrl) {
        if (channel.streamUrl.startsWith('http://')) {
          stats.byProtocol.http++;
        } else if (channel.streamUrl.startsWith('https://')) {
          stats.byProtocol.https++;
        } else {
          stats.byProtocol.other++;
        }
      }

      // País
      const country = channel.country || 'Desconocido';
      stats.byCountry[country] = (stats.byCountry[country] || 0) + 1;

      // Género
      const genre = channel.genre || 'General';
      stats.byGenre[genre] = (stats.byGenre[genre] || 0) + 1;

      // Estado
      if (channel.isActive !== false) {
        stats.active++;
      } else {
        stats.inactive++;
      }
    });

    return stats;
  }
}

export default ChannelPersistenceService;