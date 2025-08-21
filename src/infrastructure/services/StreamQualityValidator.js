import axios from 'axios';
import { TVAddonConfig } from '../config/TVAddonConfig.js';
import { ErrorHandler, ValidationError } from '../error/ErrorHandler.js';

/**
 * Servicio para validación avanzada de calidad de streams
 * Detecta problemas de audio/video en tiempo real
 */
class StreamQualityValidator {
    constructor() {
        this.config = TVAddonConfig.getInstance();
        this.activeValidations = new Map();
        this.validationResults = new Map();
    }

    /**
     * Valida la integridad de audio y video de un stream
     * @param {string} streamUrl - URL del stream a validar
     * @param {Object} options - Opciones de validación
     * @returns {Promise<Object>} Resultado de la validación
     */
    async validateStreamQuality(streamUrl, options = {}) {
        const {
            checkAudio = true,
            checkVideo = true,
            sampleDuration = 10000, // 10 segundos
            timeout = 30000
        } = options;

        try {
            const validationId = this._generateValidationId(streamUrl);
            
            // Evitar validaciones duplicadas concurrentes
            if (this.activeValidations.has(validationId)) {
                return await this.activeValidations.get(validationId);
            }

            const validationPromise = this._performQualityValidation(
                streamUrl, 
                { checkAudio, checkVideo, sampleDuration, timeout }
            );

            this.activeValidations.set(validationId, validationPromise);

            const result = await validationPromise;
            
            // Limpiar validación activa y guardar resultado
            this.activeValidations.delete(validationId);
            this.validationResults.set(validationId, {
                ...result,
                timestamp: Date.now()
            });

            return result;

        } catch (error) {
            ErrorHandler.logError('StreamQualityValidator', error);
            throw new ValidationError(`Error validating stream quality: ${error.message}`);
        }
    }

    /**
     * Realiza la validación técnica del stream
     * @private
     */
    async _performQualityValidation(streamUrl, options) {
        const { checkAudio, checkVideo, sampleDuration, timeout } = options;
        
        const result = {
            url: streamUrl,
            isValid: false,
            audioStatus: null,
            videoStatus: null,
            issues: [],
            metadata: {},
            timestamp: Date.now()
        };

        try {
            // Verificar headers del stream
            const headersCheck = await this._checkStreamHeaders(streamUrl, timeout);
            result.metadata = headersCheck.metadata;

            if (!headersCheck.isValid) {
                result.issues.push(...headersCheck.issues);
                return result;
            }

            // Validar contenido del stream
            const contentValidation = await this._validateStreamContent(
                streamUrl, 
                { checkAudio, checkVideo, sampleDuration, timeout }
            );

            result.audioStatus = contentValidation.audioStatus;
            result.videoStatus = contentValidation.videoStatus;
            result.issues.push(...contentValidation.issues);

            // Determinar si el stream es válido
            result.isValid = this._determineStreamValidity(result, { checkAudio, checkVideo });

            return result;

        } catch (error) {
            result.issues.push(`Validation error: ${error.message}`);
            return result;
        }
    }

    /**
     * Verifica los headers del stream
     * @private
     */
    async _checkStreamHeaders(streamUrl, timeout) {
        const result = {
            isValid: false,
            metadata: {},
            issues: []
        };

        try {
            const response = await axios.head(streamUrl, {
                timeout,
                validateStatus: (status) => status < 400
            });

            const contentType = response.headers['content-type'] || '';
            const contentLength = response.headers['content-length'];
            
            result.metadata = {
                contentType,
                contentLength,
                server: response.headers.server,
                lastModified: response.headers['last-modified']
            };

            // Validar tipo de contenido
            if (!this._isValidStreamContentType(contentType)) {
                result.issues.push(`Invalid content type: ${contentType}`);
                return result;
            }

            result.isValid = true;
            return result;

        } catch (error) {
            result.issues.push(`Headers check failed: ${error.message}`);
            return result;
        }
    }

    /**
     * Valida el contenido del stream
     * @private
     */
    async _validateStreamContent(streamUrl, options) {
        const { checkAudio, checkVideo, sampleDuration, timeout } = options;
        
        const result = {
            audioStatus: null,
            videoStatus: null,
            issues: []
        };

        try {
            // Obtener muestra del stream
            const streamSample = await this._getStreamSample(streamUrl, sampleDuration, timeout);
            
            if (!streamSample || streamSample.length === 0) {
                result.issues.push('No stream data received');
                return result;
            }

            // Detectar si es un playlist HLS
            const isHLSPlaylist = this._isHLSPlaylist(streamSample);
            
            if (isHLSPlaylist) {
                // Para playlists HLS, validar estructura y segmentos
                const hlsAnalysis = this._analyzeHLSPlaylist(streamSample, streamUrl);
                
                if (checkAudio) {
                    result.audioStatus = this._validateHLSAudioContent(hlsAnalysis);
                }

                if (checkVideo) {
                    result.videoStatus = this._validateHLSVideoContent(hlsAnalysis);
                }
            } else {
                // Para streams binarios, usar análisis tradicional
                const analysis = this._analyzeStreamSample(streamSample);
                
                if (checkAudio) {
                    result.audioStatus = this._validateAudioContent(analysis);
                }

                if (checkVideo) {
                    result.videoStatus = this._validateVideoContent(analysis);
                }
            }

            return result;

        } catch (error) {
            result.issues.push(`Content validation failed: ${error.message}`);
            return result;
        }
    }

    /**
     * Obtiene una muestra del stream
     * @private
     */
    async _getStreamSample(streamUrl, duration, timeout) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            let totalSize = 0;
            const maxSize = 1024 * 1024; // 1MB máximo
            
            const timeoutId = setTimeout(() => {
                reject(new Error('Stream sample timeout'));
            }, timeout);

            const sampleTimeoutId = setTimeout(() => {
                clearTimeout(timeoutId);
                resolve(Buffer.concat(chunks));
            }, duration);

            axios({
                method: 'get',
                url: streamUrl,
                responseType: 'stream',
                timeout: timeout
            }).then(response => {
                response.data.on('data', (chunk) => {
                    if (totalSize + chunk.length > maxSize) {
                        clearTimeout(timeoutId);
                        clearTimeout(sampleTimeoutId);
                        resolve(Buffer.concat(chunks));
                        return;
                    }
                    
                    chunks.push(chunk);
                    totalSize += chunk.length;
                });

                response.data.on('error', (error) => {
                    clearTimeout(timeoutId);
                    clearTimeout(sampleTimeoutId);
                    reject(error);
                });

            }).catch(error => {
                clearTimeout(timeoutId);
                clearTimeout(sampleTimeoutId);
                reject(error);
            });
        });
    }

    /**
     * Analiza la muestra del stream
     * @private
     */
    _analyzeStreamSample(sampleBuffer) {
        const analysis = {
            hasVideoMarkers: false,
            hasAudioMarkers: false,
            dataConsistency: false,
            patterns: []
        };

        if (!sampleBuffer || sampleBuffer.length === 0) {
            return analysis;
        }

        // Buscar marcadores de video (H.264, H.265, etc.)
        const videoMarkers = [
            Buffer.from([0x00, 0x00, 0x00, 0x01]), // NAL unit start code
            Buffer.from([0x00, 0x00, 0x01]), // Short start code
        ];

        // Buscar marcadores de audio (AAC, MP3, etc.)
        const audioMarkers = [
            Buffer.from([0xFF, 0xF0]), // AAC ADTS header
            Buffer.from([0xFF, 0xF1]), // AAC ADTS header
            Buffer.from([0xFF, 0xFB]), // MP3 header
        ];

        // Verificar presencia de marcadores
        for (const marker of videoMarkers) {
            if (sampleBuffer.includes(marker)) {
                analysis.hasVideoMarkers = true;
                break;
            }
        }

        for (const marker of audioMarkers) {
            if (sampleBuffer.includes(marker)) {
                analysis.hasAudioMarkers = true;
                break;
            }
        }

        // Verificar consistencia de datos
        analysis.dataConsistency = this._checkDataConsistency(sampleBuffer);

        return analysis;
    }

    /**
     * Detecta si el contenido es un playlist HLS
     * @private
     */
    _isHLSPlaylist(buffer) {
        if (!buffer || buffer.length === 0) return false;
        
        const content = buffer.toString('utf8', 0, Math.min(buffer.length, 1024));
        return content.includes('#EXTM3U') || content.includes('#EXT-X-VERSION');
    }

    /**
     * Analiza un playlist HLS
     * @private
     */
    _analyzeHLSPlaylist(buffer, baseUrl) {
        const content = buffer.toString('utf8');
        const lines = content.split('\n').map(line => line.trim()).filter(line => line);
        
        const analysis = {
            isValidPlaylist: false,
            hasSegments: false,
            hasAudioTracks: false,
            hasVideoTracks: false,
            segmentCount: 0,
            audioCodecs: [],
            videoCodecs: [],
            issues: []
        };

        // Verificar estructura básica del playlist
        if (!lines[0] || !lines[0].includes('#EXTM3U')) {
            analysis.issues.push('Invalid HLS playlist format');
            return analysis;
        }
        
        analysis.isValidPlaylist = true;
        
        // Analizar líneas del playlist
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Detectar segmentos
            if (line.startsWith('#EXTINF:')) {
                analysis.hasSegments = true;
                analysis.segmentCount++;
            }
            
            // Detectar información de codecs
            if (line.includes('CODECS=')) {
                const codecMatch = line.match(/CODECS="([^"]+)"/i);
                if (codecMatch) {
                    const codecs = codecMatch[1].split(',').map(c => c.trim());
                    
                    codecs.forEach(codec => {
                        // Detectar codecs de video
                        if (codec.startsWith('avc1') || codec.startsWith('hev1') || codec.startsWith('hvc1')) {
                            analysis.hasVideoTracks = true;
                            if (!analysis.videoCodecs.includes(codec)) {
                                analysis.videoCodecs.push(codec);
                            }
                        }
                        // Detectar codecs de audio
                        else if (codec.startsWith('mp4a') || codec.startsWith('ac-3') || codec.startsWith('ec-3')) {
                            analysis.hasAudioTracks = true;
                            if (!analysis.audioCodecs.includes(codec)) {
                                analysis.audioCodecs.push(codec);
                            }
                        }
                    });
                }
            }
            
            // Detectar streams de audio específicos
            if (line.includes('TYPE=AUDIO')) {
                analysis.hasAudioTracks = true;
            }
            
            // Detectar streams de video específicos
            if (line.includes('TYPE=VIDEO')) {
                analysis.hasVideoTracks = true;
            }
        }
        
        // Validaciones adicionales
        if (!analysis.hasSegments && !lines.some(line => line.startsWith('http'))) {
            analysis.issues.push('No segments or sub-playlists found');
        }
        
        return analysis;
    }

    /**
     * Valida contenido de audio para HLS
     * @private
     */
    _validateHLSAudioContent(hlsAnalysis) {
        const status = {
            isPresent: hlsAnalysis.hasAudioTracks || hlsAnalysis.audioCodecs.length > 0,
            isConsistent: hlsAnalysis.isValidPlaylist && hlsAnalysis.hasSegments,
            issues: []
        };

        if (!status.isPresent) {
            status.issues.push('No audio tracks detected in HLS playlist');
        }
        
        if (!status.isConsistent) {
            status.issues.push('HLS playlist structure issues detected');
        }
        
        // Agregar issues específicos del análisis HLS
        status.issues.push(...hlsAnalysis.issues);

        return status;
    }

    /**
     * Valida contenido de video para HLS
     * @private
     */
    _validateHLSVideoContent(hlsAnalysis) {
        const status = {
            isPresent: hlsAnalysis.hasVideoTracks || hlsAnalysis.videoCodecs.length > 0,
            isConsistent: hlsAnalysis.isValidPlaylist && hlsAnalysis.hasSegments,
            issues: []
        };

        if (!status.isPresent) {
            status.issues.push('No video tracks detected in HLS playlist');
        }
        
        if (!status.isConsistent) {
            status.issues.push('HLS playlist structure issues detected');
        }
        
        // Agregar issues específicos del análisis HLS
        status.issues.push(...hlsAnalysis.issues);

        return status;
    }

    /**
     * Valida el contenido de audio
     * @private
     */
    _validateAudioContent(analysis) {
        const status = {
            isPresent: analysis.hasAudioMarkers,
            isConsistent: analysis.dataConsistency,
            issues: []
        };

        if (!status.isPresent) {
            status.issues.push('No audio markers detected');
        }

        if (!status.isConsistent) {
            status.issues.push('Inconsistent audio data pattern');
        }

        return status;
    }

    /**
     * Valida el contenido de video
     * @private
     */
    _validateVideoContent(analysis) {
        const status = {
            isPresent: analysis.hasVideoMarkers,
            isConsistent: analysis.dataConsistency,
            issues: []
        };

        if (!status.isPresent) {
            status.issues.push('No video markers detected');
        }

        if (!status.isConsistent) {
            status.issues.push('Inconsistent video data pattern');
        }

        return status;
    }

    /**
     * Verifica la consistencia de los datos
     * @private
     */
    _checkDataConsistency(buffer) {
        if (!buffer || buffer.length < 1024) {
            return false;
        }

        // Verificar que no sea solo ceros o datos repetitivos
        const firstByte = buffer[0];
        let sameByteCount = 0;
        
        for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
            if (buffer[i] === firstByte) {
                sameByteCount++;
            }
        }

        // Si más del 90% son el mismo byte, probablemente no es válido
        return (sameByteCount / Math.min(buffer.length, 1024)) < 0.9;
    }

    /**
     * Determina si el stream es válido
     * @private
     */
    _determineStreamValidity(result, options) {
        const { checkAudio, checkVideo } = options;
        
        if (result.issues.length > 0) {
            return false;
        }

        if (checkAudio && result.audioStatus) {
            if (!result.audioStatus.isPresent || !result.audioStatus.isConsistent) {
                return false;
            }
        }

        if (checkVideo && result.videoStatus) {
            if (!result.videoStatus.isPresent || !result.videoStatus.isConsistent) {
                return false;
            }
        }

        return true;
    }

    /**
     * Verifica si el tipo de contenido es válido para streaming
     * @private
     */
    _isValidStreamContentType(contentType) {
        const validTypes = [
            'video/mp2t',
            'application/vnd.apple.mpegurl',
            'application/x-mpegURL',
            'video/MP2T',
            'application/octet-stream'
        ];

        return validTypes.some(type => contentType.toLowerCase().includes(type.toLowerCase()));
    }

    /**
     * Genera un ID único para la validación
     * @private
     */
    _generateValidationId(streamUrl) {
        return Buffer.from(streamUrl).toString('base64').slice(0, 16);
    }

    /**
     * Obtiene el resultado de una validación previa
     * @param {string} streamUrl - URL del stream
     * @returns {Object|null} Resultado de la validación o null
     */
    getValidationResult(streamUrl) {
        const validationId = this._generateValidationId(streamUrl);
        return this.validationResults.get(validationId) || null;
    }

    /**
     * Limpia resultados de validación antiguos
     * @param {number} maxAge - Edad máxima en milisegundos (default: 5 minutos)
     */
    cleanupOldResults(maxAge = 300000) {
        const now = Date.now();
        
        for (const [key, result] of this.validationResults.entries()) {
            if (now - result.timestamp > maxAge) {
                this.validationResults.delete(key);
            }
        }
    }
}

export { StreamQualityValidator };