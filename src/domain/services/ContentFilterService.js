/**
 * Servicio para filtrar contenido de canales según palabras clave y patrones
 * Implementa filtros para contenido religioso, adulto y político
 */
class ContentFilterService {
  /**
   * @param {Object} filterConfig - Configuración de filtros desde TVAddonConfig
   */
  constructor(filterConfig) {
    this.#filterConfig = filterConfig;
    this.#initializeFilters();
  }

  #filterConfig;
  #religiousPatterns = [];
  #adultPatterns = [];
  #politicalPatterns = [];

  /**
   * Inicializa los patrones de filtrado
   * @private
   */
  #initializeFilters() {
    // Convertir palabras clave a patrones de expresiones regulares
    this.#religiousPatterns = this.#createPatterns(this.#filterConfig.religiousKeywords);
    this.#adultPatterns = this.#createPatterns(this.#filterConfig.adultKeywords);
    this.#politicalPatterns = this.#createPatterns(this.#filterConfig.politicalKeywords);
  }

  /**
   * Crea patrones de expresiones regulares desde palabras clave
   * @private
   * @param {string[]} keywords
   * @returns {RegExp[]}
   */
  #createPatterns(keywords) {
    if (!Array.isArray(keywords)) return [];
    
    return keywords.map(keyword => {
      // Escapar caracteres especiales y crear patrón que busque la palabra completa
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    });
  }

  /**
   * Filtra un array de canales según los filtros configurados
   * @param {Array} channels - Array de canales a filtrar
   * @returns {Array} Array de canales filtrados
   */
  filterChannels(channels) {
    if (!Array.isArray(channels)) {
      return [];
    }

    return channels.filter(channel => this.#shouldKeepChannel(channel));
  }

  /**
   * Determina si un canal debe mantenerse según los filtros
   * @private
   * @param {Object} channel - Canal a evaluar
   * @returns {boolean}
   */
  #shouldKeepChannel(channel) {
    if (!channel) return false;

    // Obtener texto combinado del canal para análisis
    const channelText = this.#getChannelText(channel);
    
    // Aplicar filtros según configuración
    if (this.#filterConfig.filterReligiousContent && this.#containsReligiousContent(channelText)) {
      return false;
    }

    if (this.#filterConfig.filterAdultContent && this.#containsAdultContent(channelText)) {
      return false;
    }

    if (this.#filterConfig.filterPoliticalContent && this.#containsPoliticalContent(channelText)) {
      return false;
    }

    return true;
  }

  /**
   * Extrae texto relevante del canal para análisis
   * @private
   * @param {Object} channel
   * @returns {string}
   */
  #getChannelText(channel) {
    const textParts = [];
    
    // Agregar nombre del canal
    if (channel.name) {
      textParts.push(channel.name);
    }
    
    // Agregar título si existe
    if (channel.title) {
      textParts.push(channel.title);
    }
    
    // Agregar descripción si existe
    if (channel.description) {
      textParts.push(channel.description);
    }
    
    // Agregar categoría si existe
    if (channel.category) {
      textParts.push(channel.category);
    }
    
    // Agregar grupo si existe
    if (channel.group) {
      textParts.push(channel.group);
    }
    
    // Agregar géneros si existen
    if (Array.isArray(channel.genres)) {
      textParts.push(...channel.genres);
    }
    
    return textParts.join(' ').toLowerCase();
  }

  /**
   * Verifica si el texto contiene contenido religioso
   * @private
   * @param {string} text
   * @returns {boolean}
   */
  #containsReligiousContent(text) {
    return this.#matchesPatterns(text, this.#religiousPatterns);
  }

  /**
   * Verifica si el texto contiene contenido adulto
   * @private
   * @param {string} text
   * @returns {boolean}
   */
  #containsAdultContent(text) {
    return this.#matchesPatterns(text, this.#adultPatterns);
  }

  /**
   * Verifica si el texto contiene contenido político
   * @private
   * @param {string} text
   * @returns {boolean}
   */
  #containsPoliticalContent(text) {
    return this.#matchesPatterns(text, this.#politicalPatterns);
  }

  /**
   * Verifica si el texto coincide con alguno de los patrones
   * @private
   * @param {string} text
   * @param {RegExp[]} patterns
   * @returns {boolean}
   */
  #matchesPatterns(text, patterns) {
    if (!text || !Array.isArray(patterns)) {
      return false;
    }

    return patterns.some(pattern => pattern.test(text));
  }

  /**
   * Obtiene estadísticas de filtrado
   * @param {Array} originalChannels - Canales originales
   * @param {Array} filteredChannels - Canales después del filtrado
   * @returns {Object}
   */
  getFilterStats(originalChannels, filteredChannels) {
    const originalCount = Array.isArray(originalChannels) ? originalChannels.length : 0;
    const filteredCount = Array.isArray(filteredChannels) ? filteredChannels.length : 0;
    const removedCount = originalCount - filteredCount;

    // Contar canales removidos por categoría
    const removedByCategory = this.#countRemovedByCategory(originalChannels, filteredChannels);

    return {
      originalChannels: originalCount,
      filteredChannels: filteredCount,
      removedChannels: removedCount,
      removalPercentage: originalCount > 0 ? ((removedCount / originalCount) * 100).toFixed(2) : '0.00',
      removedByCategory,
      filtersActive: {
        religious: this.#filterConfig.filterReligiousContent,
        adult: this.#filterConfig.filterAdultContent,
        political: this.#filterConfig.filterPoliticalContent
      }
    };
  }

  /**
   * Cuenta canales removidos por categoría
   * @private
   * @param {Array} originalChannels
   * @param {Array} filteredChannels
   * @returns {Object}
   */
  #countRemovedByCategory(originalChannels, filteredChannels) {
    if (!Array.isArray(originalChannels) || !Array.isArray(filteredChannels)) {
      return { religious: 0, adult: 0, political: 0 };
    }

    const filteredIds = new Set(filteredChannels.map(ch => ch.id || ch.name));
    const removedChannels = originalChannels.filter(ch => !filteredIds.has(ch.id || ch.name));

    let religious = 0;
    let adult = 0;
    let political = 0;

    removedChannels.forEach(channel => {
      const channelText = this.#getChannelText(channel);
      
      if (this.#containsReligiousContent(channelText)) religious++;
      if (this.#containsAdultContent(channelText)) adult++;
      if (this.#containsPoliticalContent(channelText)) political++;
    });

    return { religious, adult, political };
  }

  /**
   * Verifica si los filtros están activos
   * @returns {boolean}
   */
  hasActiveFilters() {
    return this.#filterConfig.filterReligiousContent || 
           this.#filterConfig.filterAdultContent || 
           this.#filterConfig.filterPoliticalContent;
  }

  /**
   * Obtiene la configuración actual de filtros
   * @returns {Object}
   */
  getFilterConfiguration() {
    return {
      religious: {
        enabled: this.#filterConfig.filterReligiousContent,
        keywordCount: this.#filterConfig.religiousKeywords?.length || 0
      },
      adult: {
        enabled: this.#filterConfig.filterAdultContent,
        keywordCount: this.#filterConfig.adultKeywords?.length || 0
      },
      political: {
        enabled: this.#filterConfig.filterPoliticalContent,
        keywordCount: this.#filterConfig.politicalKeywords?.length || 0
      }
    };
  }
}

export default ContentFilterService;