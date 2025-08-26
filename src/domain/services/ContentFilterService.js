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
    
    // Patrones religiosos mejorados con alta precisión
    this.#religiousPatterns = [
      // Palabras específicamente religiosas (alta precisión)
      /\b(iglesia|pastor|predicador|sermon|biblia|evangelio)\b/i,
      /\b(cristiano|catolico|protestante|pentecostal|bautista|metodista)\b/i,
      /\b(adventista|testigo|jehova|mormon|mision|ministerio)\b/i,
      /\b(apostol|profeta|sacerdote|obispo|papa|vaticano)\b/i,
      /\b(templo|catedral|capilla|santuario|altar|cruz|crucifijo)\b/i,
      /\b(rosario|oracion|rezo|bendicion|milagro|santo|santa)\b/i,
      /\b(virgen|maria|jesus|cristo|dios|señor|espiritu|trinidad)\b/i,
      /\b(salvacion|pecado|perdon|gracia|gloria|aleluya|amen|hosanna)\b/i,
      /\b(gospel|church|christian|catholic|protestant|baptist)\b/i,
      /\b(methodist|pentecostal|evangelical|apostolic|ministry)\b/i,
      /\b(priest|bishop|pope|temple|cathedral|chapel|sanctuary)\b/i,
      /\b(prayer|blessing|miracle|saint|virgin|mary|jesus|christ)\b/i,
      /\b(god|lord|spirit|trinity|salvation|sin|forgiveness)\b/i,
      /\b(grace|glory|hallelujah|amen|hosanna)\b/i
    ];
    
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
    
    // Verificar contenido religioso con lógica mejorada
    if (this.#filterConfig.filterReligiousContent) {
      const religiousResult = this.#checkReligiousContent(channel, channelText);
      if (religiousResult.isReligious) {
        return false;
      }
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
    
    // Agregar URL/dominio para análisis de contenido
    if (channel.url) {
      try {
        // Extraer dominio de la URL
        const url = new URL(channel.url);
        const domain = url.hostname.toLowerCase();
        textParts.push(domain);
        
        // También agregar la URL completa para análisis más detallado
        textParts.push(channel.url.toLowerCase());
      } catch (error) {
        // Si la URL no es válida, agregar como texto plano
        textParts.push(channel.url.toLowerCase());
      }
    }
    
    // Agregar stream URL si es diferente de la URL principal
    if (channel.stream && channel.stream !== channel.url) {
      try {
        const streamUrl = new URL(channel.stream);
        const streamDomain = streamUrl.hostname.toLowerCase();
        textParts.push(streamDomain);
        textParts.push(channel.stream.toLowerCase());
      } catch (error) {
        textParts.push(channel.stream.toLowerCase());
      }
    }
    
    return textParts.join(' ').toLowerCase();
  }

  /**
    * Verifica si el canal contiene contenido religioso con lógica mejorada
    * @private
    * @param {Object} channel
    * @param {string} text
    * @returns {Object}
    */
   #checkReligiousContent(channel, text) {
     // Lista de excepciones conocidas que no deben ser filtradas
     const exceptions = ['telefe', 'telefonica', 'telefilm', 'telefutura'];
     
     // Verificar si el canal está en la lista de excepciones
     const channelName = (channel.name || '').toLowerCase();
     if (exceptions.some(exception => channelName.includes(exception))) {
       return { isReligious: false, reason: 'exception' };
     }
     
     // Verificar patrones religiosos con mayor precisión
     const hasReligiousPattern = this.#matchesPatterns(text, this.#religiousPatterns);
     
     return {
       isReligious: hasReligiousPattern,
       reason: hasReligiousPattern ? 'pattern_match' : 'no_match'
     };
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